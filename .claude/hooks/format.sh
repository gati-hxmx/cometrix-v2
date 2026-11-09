#!/bin/bash
# PostToolUse（Edit・Write）: 編集したファイルを整形する。
# 整形の道具はスタックを決めたときに入る。無ければ何もしない。

set -u
input=$(cat)
path=$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("tool_input",{}); print(d.get("file_path") or "")' 2>/dev/null || true)
[ -n "$path" ] && [ -f "$path" ] || exit 0

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 0
if [ -f biome.json ] || [ -f biome.jsonc ]; then
  npx --no-install biome format --write "$path" >/dev/null 2>&1 || true
elif [ -f pyproject.toml ] && command -v ruff >/dev/null 2>&1; then
  case "$path" in *.py) ruff format "$path" >/dev/null 2>&1 || true ;; esac
fi
exit 0
