#!/bin/bash
# PreToolUse（Edit・Write）: 秘密情報のファイルを編集させない。
# 安全装置のファイル（workflows・settings・CODEOWNERS・リスク基準）は編集できるが、
# CODEOWNERS により人の承認がないとマージされない。

set -u
input=$(cat)
path=$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("tool_input",{}); print(d.get("file_path") or d.get("path") or "")' 2>/dev/null || true)
name=$(basename "$path")

case "$name" in
  .env.example) exit 0 ;;
  .env|.env.*|*.pem|*.key|id_rsa*|id_ed25519*)
    echo "このファイル（$name）は秘密情報を含むため編集しません。必要な値は GitHub の Secret か各サービスの設定に置き、escalate で人に頼んでください。" >&2
    exit 2 ;;
esac
exit 0
