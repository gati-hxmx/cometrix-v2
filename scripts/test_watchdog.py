"""scripts/watchdog.py の判断のテスト（python3 -m unittest で動く。scripts/check が実行する）。"""

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import watchdog as w  # noqa: E402

T0 = datetime(2026, 11, 12, 19, 11, tzinfo=timezone.utc)
SHA = "be51112"
CODEX = "chatgpt-codex-connector"


def at(minutes):
    return (T0 + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def pr():
    return {"number": 19, "head": {"sha": SHA, "ref": "claude/4-analysis-screen"}}


def state(comments=(), reviews=(), reactions=(), running=False):
    return w.build_state(pr(), T0, list(comments), list(reviews), list(reactions), CODEX, running)


def user(login):
    return {"login": login}


class DecideTest(unittest.TestCase):
    def test_bot_request_refused_then_retry_with_token(self):
        # PR #19 の実例：claude[bot] の @codex review に Codex が反応せず、一晩止まった
        s = state(comments=[{"created_at": at(0), "user": user("claude[bot]"), "body": "@codex review"},
                            {"created_at": at(0), "user": user(f"{CODEX}[bot]"), "body": "To use Codex here, ..."}])
        self.assertIsNone(w.decide(s, T0 + timedelta(minutes=20), has_token=True))
        self.assertEqual(w.decide(s, T0 + timedelta(minutes=31), has_token=True), "request-codex")

    def test_without_token_claude_reviews_instead(self):
        s = state()
        self.assertEqual(w.decide(s, T0 + timedelta(hours=1), has_token=False), "claude-review")

    def test_retry_cap_then_substitute_then_notify(self):
        mark = f"<!-- watchdog:request-codex sha={SHA} -->"
        s = state(comments=[{"created_at": at(30), "user": user("x"), "body": mark},
                            {"created_at": at(60), "user": user("x"), "body": mark}])
        now = T0 + timedelta(hours=2)
        self.assertEqual(w.decide(s, now, has_token=True), "claude-review")
        s.nudges["claude-review"] = 1
        self.assertEqual(w.decide(s, now, has_token=True), "notify")
        s.nudges["notify"] = 1
        self.assertIsNone(w.decide(s, now, has_token=True))

    def test_markers_for_older_commit_do_not_count(self):
        s = state(comments=[{"created_at": at(30), "user": user("x"),
                             "body": "<!-- watchdog:request-codex sha=0ld -->"}] * 2)
        self.assertEqual(s.nudges, {})

    def test_codex_running_waits_up_to_an_hour(self):
        s = state(reactions=[{"created_at": at(1), "user": user(f"{CODEX}[bot]"), "content": "eyes"}])
        self.assertIsNone(w.decide(s, T0 + timedelta(minutes=45), has_token=True))
        self.assertEqual(w.decide(s, T0 + timedelta(minutes=62), has_token=True), "request-codex")

    def test_review_done_but_stalled_advances(self):
        s = state(reviews=[{"submitted_at": at(10), "user": user(f"{CODEX}[bot]"), "commit_id": SHA}])
        self.assertEqual(s.codex_done_at, T0 + timedelta(minutes=10))
        self.assertIsNone(w.decide(s, T0 + timedelta(minutes=30), has_token=True))
        self.assertEqual(w.decide(s, T0 + timedelta(minutes=41), has_token=True), "advance")

    def test_thumbs_up_counts_as_review_done(self):
        # 指摘なしのとき Codex は 👍 だけでレビューを付けないので、merge-gate が呼ばれず止まる
        s = state(reactions=[{"created_at": at(5), "user": user(f"{CODEX}[bot]"), "content": "+1"}])
        self.assertEqual(w.decide(s, T0 + timedelta(hours=1), has_token=True), "advance")

    def test_thumbs_up_resets_idle_timer(self):
        s = state(reactions=[{"created_at": at(120), "user": user(f"{CODEX}[bot]"), "content": "+1"}])
        self.assertIsNone(w.decide(s, T0 + timedelta(minutes=130), has_token=True))
        self.assertEqual(w.decide(s, T0 + timedelta(minutes=151), has_token=True), "advance")

    def test_review_of_older_commit_is_not_done(self):
        s = state(reviews=[{"submitted_at": at(10), "user": user(f"{CODEX}[bot]"), "commit_id": "0ld"}])
        self.assertIsNone(s.codex_done_at)

    def test_recent_activity_or_running_agent_waits(self):
        s = state(comments=[{"created_at": at(50), "user": user("claude[bot]"), "body": "対応中"}])
        self.assertIsNone(w.decide(s, T0 + timedelta(minutes=70), has_token=True))
        self.assertIsNone(w.decide(state(running=True), T0 + timedelta(hours=3), has_token=True))


class RerunTest(unittest.TestCase):
    def run_(self, minutes_ago, **kw):
        base = {"status": "completed", "conclusion": "failure", "run_attempt": 1,
                "updated_at": at(-minutes_ago)}
        base.update(kw)
        return w.should_rerun(base, T0)

    def test_failed_run_is_rerun_once_after_wait(self):
        self.assertFalse(self.run_(10))
        self.assertTrue(self.run_(40))
        self.assertTrue(self.run_(40, conclusion="timed_out"))
        self.assertFalse(self.run_(40, run_attempt=2))
        self.assertFalse(self.run_(60 * 25))

    def test_failed_again_after_rerun_is_notified_once(self):
        def notify(minutes_ago, **kw):
            base = {"status": "completed", "conclusion": "failure", "run_attempt": 2,
                    "updated_at": at(-minutes_ago)}
            base.update(kw)
            return w.should_notify_run(base, T0)
        self.assertTrue(notify(5))
        self.assertFalse(notify(20))  # 前の見張りで通知済み
        self.assertFalse(notify(5, run_attempt=1))
        self.assertFalse(notify(5, conclusion="success"))

    def test_success_skipped_cancelled_are_left_alone(self):
        for c in ("success", "skipped", "cancelled"):
            self.assertFalse(self.run_(40, conclusion=c))


if __name__ == "__main__":
    unittest.main()
