# VPS で YouTube のチャットが取れるかの確認

YouTube はクラウドや VPS の IP からの取得を止めることがあります（`Sign in to confirm you're not a bot` など）。本番を作る（#12）前に、VPS 上で実際に取れるかを確かめます。

## 手順

1. VPS で、取得に使う公開のアーカイブ（チャットのリプレイが有効なライブ配信）の URL を決める。
2. ワーカーのイメージで yt-dlp を直接動かす。

   ```sh
   docker compose build worker
   docker compose run --rm --no-deps worker \
     yt-dlp --skip-download --write-subs --sub-langs live_chat --print title -o /tmp/chat -- "<URL>"
   ```

3. 成功なら `/tmp/chat.live_chat.json` ができる。`fetch_blocked` の表示（`Sign in to confirm you're not a bot`・HTTP 429）が出たら止められている。
4. アプリ経由でも確かめる。

   ```sh
   docker compose up -d --build
   curl -s -X POST localhost:3000/api/jobs -H 'content-type: application/json' -d '{"url":"<URL>"}'
   curl -s localhost:3000/api/jobs/<返ってきた id>
   ```

   `status` が `done` になり、`result.totalComments` が入っていれば取れている。

## 結果

- 未確認（VPS はまだない。オーナーの Mac では手元の確認のみ）。確認したら日付・場所・結果をここと Issue #3 に書く。

## 止められたとき

- yt-dlp を最新にする（`docker compose build --no-cache worker`）。
- 住宅用の回線から取る、Cookie を渡す、などの対策は、効果と規約への影響を確かめて別の Issue で決める。
