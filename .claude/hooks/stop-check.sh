#!/bin/bash
# Stop: 作業ブランチで変更があるのに検証が通っていなければ、終わらせずに直させる。
# 「テストを回して」とお願いする代わりに、通らないと終われない仕組みにする。

set -u
input=$(cat)
active=$(printf '%s' "$input" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("stop_hook_active", False)).lower())' 2>/dev/null || echo false)

# 2回目以降（すでに一度止めて直させている）は、無限に止めないよう通す。
[ "$active" = "true" ] && exit 0

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
[ -z "$branch" ] || [ "$branch" = "main" ] && exit 0

# 変更がなければ確かめる必要はない（まだ git に追加していない新しいファイルも変更に数える）。
if [ -z "$(git status --porcelain 2>/dev/null)" ] && [ -z "$(git log --oneline origin/main..HEAD 2>/dev/null)" ]; then
  exit 0
fi

[ -x scripts/check ] || exit 0
if ! out=$(scripts/check 2>&1); then
  {
    echo "scripts/check が通っていません。直してから終えてください（テストを消す・スキップする・期待値を書き換えることはしない）。直せない場合は、試したことを書いて escalate してください。"
    echo
    printf '%s\n' "$out" | tail -40
  } >&2
  exit 2
fi
exit 0
