#!/usr/bin/env python3
"""止まった自走作業を見つけて再開する（.github/workflows/watchdog.yml が15分ごとに動かす）。

見るものは2つだけです。
1. Claude の PR（claude/ ブランチ）で、レビューや次の工程が30分以上動いていないもの
   - Codex のレビューが始まっていない → 人のトークン（CODEX_REQUEST_TOKEN）で `@codex review` を頼み直す。
     Codex は bot のコメントには反応しないため。2回頼んでも始まらなければ Claude が代わりにレビューする。
   - レビューは終わったのに止まっている → Claude に address か merge-gate で進めてもらう（2回まで）
   - それでも動かなければ Discord に1回だけ知らせる
2. エラーで終わった Agent の実行 → 30分おいて1回だけ再実行する

再開の記録は PR に `<!-- watchdog:種類 sha=... -->` 付きのコメントとして残し、回数の上限に使う。
`--dry-run` を付けると、何もせずに判断だけを表示する。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

IDLE = timedelta(minutes=int(os.environ.get("WATCHDOG_IDLE_MINUTES", "30")))
CODEX_RUNNING_LIMIT = timedelta(minutes=60)  # 👀 が付いてからこの時間は待つ
RERUN_WAIT = timedelta(minutes=30)
RERUN_WINDOW = timedelta(hours=24)
WATCH_INTERVAL = timedelta(minutes=15)  # watchdog.yml の間隔。再実行も失敗した実行の通知は、この間に1回だけ
MAX_NUDGES = 2
SKIP_LABELS = {"needs-human", "blocked"}
MARKER = re.compile(r"<!-- watchdog:(\w[\w-]*) sha=([0-9a-f]+) -->")


def ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass
class PrState:
    """判断に使う PR の様子（GitHub から集めたもの）。"""

    number: int
    head_sha: str
    head_time: datetime
    last_activity: datetime
    codex_done_at: datetime | None = None
    codex_running_at: datetime | None = None
    nudges: dict[str, int] = field(default_factory=dict)  # この head_sha での再開の回数（種類ごと）
    agent_running: bool = False


def decide(pr: PrState, now: datetime, has_token: bool) -> str | None:
    """次にすることを返す。何もしないときは None。

    request-codex: 人のトークンで @codex review を頼み直す
    claude-review: Claude が代わりにレビューして進める
    advance:       Claude に address か merge-gate で進めてもらう
    notify:        Discord に知らせる（1回だけ）
    """
    if pr.agent_running or now - pr.last_activity < IDLE:
        return None
    if pr.nudges.get("notify", 0):
        return None

    if pr.codex_done_at is None:
        if pr.codex_running_at and now - pr.codex_running_at < CODEX_RUNNING_LIMIT:
            return None
        if has_token and pr.nudges.get("request-codex", 0) < MAX_NUDGES:
            return "request-codex"
        if pr.nudges.get("claude-review", 0) < 1:
            return "claude-review"
        return "notify"

    if pr.nudges.get("advance", 0) < MAX_NUDGES:
        return "advance"
    return "notify"


def should_rerun(run: dict, now: datetime) -> bool:
    """エラーで終わった Agent の実行を、1回だけ再実行するか。"""
    if run.get("status") != "completed" or run.get("conclusion") not in ("failure", "timed_out"):
        return False
    if run.get("run_attempt", 1) != 1:
        return False
    done = ts(run.get("updated_at"))
    return done is not None and RERUN_WAIT <= now - done <= RERUN_WINDOW


def should_notify_run(run: dict, now: datetime) -> bool:
    """再実行しても失敗した実行を知らせるか（終わってから最初の見張りで1回だけ）。"""
    if run.get("status") != "completed" or run.get("conclusion") not in ("failure", "timed_out"):
        return False
    if run.get("run_attempt", 1) < 2:
        return False
    done = ts(run.get("updated_at"))
    return done is not None and timedelta(0) <= now - done < WATCH_INTERVAL


def is_login(user: dict | None, login: str) -> bool:
    name = (user or {}).get("login", "")
    return name in (login, f"{login}[bot]")


def build_state(pr: dict, head_time: datetime, comments: list, reviews: list, reactions: list,
                codex: str, agent_running: bool) -> PrState:
    sha = pr["head"]["sha"]
    state = PrState(number=pr["number"], head_sha=sha, head_time=head_time,
                    last_activity=head_time, agent_running=agent_running)

    def done(at: datetime | None) -> None:
        if at and at >= head_time and (state.codex_done_at is None or at < state.codex_done_at):
            state.codex_done_at = at

    for c in comments:
        at = ts(c.get("created_at"))
        body = c.get("body") or ""
        for kind, marker_sha in MARKER.findall(body):
            if marker_sha == sha:
                state.nudges[kind] = state.nudges.get(kind, 0) + 1
        if is_login(c.get("user"), codex) and "codex-review-receipt" in body:
            done(at)
        if at and at > state.last_activity:
            state.last_activity = at
    for r in reviews:
        at = ts(r.get("submitted_at"))
        if is_login(r.get("user"), codex) and r.get("commit_id") == sha:
            done(at)
        if at and at > state.last_activity:
            state.last_activity = at
    for r in reactions:
        at = ts(r.get("created_at"))
        if not is_login(r.get("user"), codex) or not at or at < head_time:
            continue
        if r.get("content") == "+1":
            done(at)
            state.last_activity = max(state.last_activity, at)
        elif r.get("content") == "eyes":
            state.codex_running_at = max(state.codex_running_at or at, at)
    return state


# --- ここから下は GitHub とのやりとり ---

def gh(*args: str, token: str | None = None, check: bool = True) -> str:
    env = dict(os.environ)
    if token:
        env["GH_TOKEN"] = token
    out = subprocess.run(["gh", *args], capture_output=True, text=True, env=env, check=False)
    if check and out.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)}: {out.stderr.strip()}")
    return out.stdout


def get(path: str):
    return json.loads(gh("api", path))


def get_all(path: str) -> list:
    pages = json.loads(gh("api", "--paginate", "--slurp", path))
    return [x for page in pages for x in page]


def comment(repo: str, number: int, body: str, token: str | None = None) -> None:
    gh("api", f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}", token=token)


def main() -> int:
    dry = "--dry-run" in sys.argv
    repo = os.environ["GITHUB_REPOSITORY"]
    codex = os.environ.get("CODEX_BOT_LOGIN") or "chatgpt-codex-connector"
    token = os.environ.get("CODEX_REQUEST_TOKEN") or None
    now = datetime.now(timezone.utc)
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")

    def act(label: str, fn) -> None:
        print(("（dry-run）" if dry else "") + label)
        if not dry:
            fn()

    runs = get(f"repos/{repo}/actions/workflows/agent.yml/runs?per_page=100")["workflow_runs"]
    running = [r for r in runs if r.get("status") in ("queued", "in_progress", "waiting", "pending")]
    busy = {r["head_branch"] for r in running}
    # 見張りが頼んだ実行（workflow_dispatch）はブランチが main になるので、動いている間は PR を触らない
    all_busy = any(r.get("event") in ("workflow_dispatch", "schedule") for r in running)

    # 2. エラーで終わった Agent の実行を再実行する
    for run in runs:
        if should_rerun(run, now):
            act(f"再実行: {run['html_url']}",
                lambda run=run: gh("run", "rerun", str(run["id"]), "--failed", "-R", repo))
        elif should_notify_run(run, now):
            act(f"通知（再実行も失敗）: {run['html_url']}",
                lambda run=run: subprocess.run(
                    ["scripts/notify", f"Agent の実行が再実行しても失敗しました: {run['html_url']}"], check=False))

    # 1. 止まった PR を進める
    for pr in get_all(f"repos/{repo}/pulls?state=open&per_page=100"):
        ref = pr["head"]["ref"]
        labels = {lb["name"] for lb in pr.get("labels", [])}
        if not ref.startswith("claude/") or pr.get("draft") or pr.get("auto_merge") or labels & SKIP_LABELS:
            continue
        n = pr["number"]
        commit = get(f"repos/{repo}/commits/{pr['head']['sha']}")
        state = build_state(
            pr,
            head_time=ts(commit["commit"]["committer"]["date"]),
            comments=get_all(f"repos/{repo}/issues/{n}/comments?per_page=100"),
            reviews=get_all(f"repos/{repo}/pulls/{n}/reviews?per_page=100"),
            reactions=get_all(f"repos/{repo}/issues/{n}/reactions?per_page=100"),
            codex=codex,
            agent_running=all_busy or ref in busy,
        )
        action = decide(state, now, has_token=bool(token))
        if action is None:
            continue
        mark = f"<!-- watchdog:{action} sha={state.head_sha} -->"
        url = f"{server}/{repo}/pull/{n}"
        if action == "request-codex":
            body = (f"@codex review\n\n上のコメントの依頼（仕様・画面の確認など）もあわせてお願いします。\n\n"
                    f"_自動の見張り：レビューが{IDLE.seconds // 60}分以上始まらなかったため頼み直しました。_\n{mark}")
            act(f"PR #{n}: Codex にレビューを頼み直す", lambda n=n, body=body: comment(repo, n, body, token=token))
        elif action in ("claude-review", "advance"):
            why = ("Codex のレビューが始まらないため、Claude が代わりにレビューします。"
                   if action == "claude-review" else
                   f"レビューのあと{IDLE.seconds // 60}分以上動きがないため、Claude が次の工程から再開します。")
            def run_agent(action=action, why=why, mark=mark, n=n):
                comment(repo, n, f"_自動の見張り：{why}_\n{mark}")
                gh("workflow", "run", "agent.yml", "-R", repo, "-f", f"task={action}", "-f", f"pr={n}")
            act(f"PR #{n}: {action}", run_agent)
        elif action == "notify":
            def notify(mark=mark, n=n, url=url):
                comment(repo, n, f"_自動の見張り：自動で再開しても進まないため、人に知らせました。_\n{mark}")
                subprocess.run(["scripts/notify", f"自走が止まっています（自動の再開でも進みません）: PR #{n} {url}"], check=False)
            act(f"PR #{n}: 通知", notify)
    return 0


if __name__ == "__main__":
    sys.exit(main())
