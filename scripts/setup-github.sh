#!/bin/bash
# GitHub のラベル・main のルール・自動マージの設定を一度に作る（docs/setup.md の 1）。
# 何度実行しても同じ結果になる。
#
# 使い方: scripts/setup-github.sh <owner/repo>
# 必要なもの: gh（リポジトリの管理者権限でログイン済み）

set -euo pipefail

repo="${1:-}"
if [ -z "$repo" ]; then
  echo "使い方: scripts/setup-github.sh <owner/repo>" >&2
  exit 2
fi

echo "▶ ラベル"
label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null && echo "  $1"; }
label "agent"        "5319e7" "AI に任せる（triage から自動で進む）"
label "codex"        "0e8a16" "Codex が担当する小さな作業"
label "risk:low"     "c2e0c6" "低リスク：自動マージ・自動リリース"
label "risk:medium"  "fbca04" "中リスク：自動マージ・段階公開"
label "risk:high"    "d93f0b" "高リスク：人の承認が必要"
label "in-progress"  "1d76db" "AI が作業中"
label "needs-human"  "b60205" "人の判断待ち"
label "blocked"      "cfd3d7" "利用上限などで保留中（groom が再開する）"
label "feature"      "a2eeef" "機能の追加・変更"
label "bug"          "d73a4a" "不具合"
label "chore"        "ededed" "定型作業"
label "incident"     "000000" "本番の異常"

echo "▶ リポジトリの設定（自動マージ・マージ後のブランチ削除・squash のみ）"
gh api -X PATCH "repos/$repo" \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false >/dev/null

echo "▶ main のルール"
ruleset_name="main を守る"
existing=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$ruleset_name\") | .id" || true)
body=$(cat <<JSON
{
  "name": "$ruleset_name",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "check" } ]
    } }
  ]
}
JSON
)
if [ -n "$existing" ]; then
  echo "$body" | gh api -X PUT "repos/$repo/rulesets/$existing" --input - >/dev/null
  echo "  更新しました（id $existing）"
else
  echo "$body" | gh api -X POST "repos/$repo/rulesets" --input - >/dev/null
  echo "  作成しました"
fi

echo "✓ 完了。Secret（CLAUDE_CODE_OAUTH_TOKEN・DISCORD_WEBHOOK_URL）は docs/setup.md を見て登録してください。"
