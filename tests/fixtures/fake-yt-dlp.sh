#!/bin/sh
# テスト用の yt-dlp の代わり（tests/yt-dlp-stall.test.ts）。FAKE_YT_DLP で動きを変える。
#   slow  … 0.1秒ごとに1行ずつ書き、1.2秒で書き終える（全体は長いが、止まってはいない）
#   stall … 1行書いたあと、何も書かずに待ち続ける
#   flaky … 理由の分からないエラーで終わる
#   later … まだ始まっていない配信の枠のエラーで終わる
while [ "$#" -gt 0 ] && [ "$1" != "-o" ]; do shift; done
out="$2.live_chat.json"
echo "テスト配信"
echo "120"
line='{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{"message":{"runs":[{"text":"w"}]},"authorName":{"simpleText":"a"}}}}}],"videoOffsetTimeMsec":"1000"}}'
if [ "$FAKE_YT_DLP" = "flaky" ]; then
  echo "ERROR: [youtube] aaaaaaaaaaa: Unable to download JSON metadata: HTTP Error 503" >&2
  exit 1
fi
if [ "$FAKE_YT_DLP" = "later" ]; then
  echo "ERROR: [youtube] aaaaaaaaaaa: This live event will begin in 309 days." >&2
  exit 1
fi
if [ "$FAKE_YT_DLP" = "stall" ]; then
  echo "$line" >> "$out.part"
  exec sleep 30
fi
i=0
while [ "$i" -lt 12 ]; do
  echo "$line" >> "$out.part"
  sleep 0.1
  i=$((i + 1))
done
mv "$out.part" "$out"
