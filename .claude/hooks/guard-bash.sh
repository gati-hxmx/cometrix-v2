#!/bin/bash
# PreToolUse（Bash）: 取り返しのつかないコマンドを止める。
# 終了コード 2 で止めると、理由が Claude に伝わる。

set -u
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)

block() {
  echo "この操作は止めました: $1。AGENTS.md の「4. 禁止事項」を見てください。必要なら escalate スキルで人に相談してください。" >&2
  exit 2
}

case "$cmd" in
  *"git push"*"--force"*|*"git push"*" -f"*) block "force push" ;;
esac
if printf '%s' "$cmd" | grep -qE 'git push[^;&|]*[[:space:]](origin[[:space:]]+)?(HEAD:)?(main|master)([[:space:]]|$)'; then
  block "main への直接 push"
fi
if printf '%s' "$cmd" | grep -qE -- '--no-verify'; then
  block "検証を飛ばす --no-verify"
fi
# shellcheck disable=SC2016  # $HOME はコマンド文字列の中の文字として探す
if printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f?[[:space:]]+(/|~|\$HOME)([[:space:]]|/?$)'; then
  block "ホームやルートの削除"
fi
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(cat|less|more|head|tail|cp|mv)[[:space:]][^;&|]*\.env([[:space:]]|$)'; then
  block ".env（秘密情報）の読み書き"
fi
if printf '%s' "$cmd" | grep -qE 'gh[[:space:]]+(api|ruleset|repo[[:space:]]+edit)[^;&|]*(rulesets|branches/[^ ]+/protection|-X[[:space:]]*(DELETE|PUT|PATCH))'; then
  block "GitHub のルールやリポジトリ設定の変更"
fi
exit 0
