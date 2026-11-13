# #6 Twitch のアーカイブにも対応する

## 目的

YouTube と同じように、Twitch のアーカイブ（VOD）の URL でも、チャットの30秒ごとの集計・絞り込み・グラフのクリックからの再生ができるようにする。

## 受け入れ条件

### URL
- `twitch.tv/videos/<数字>`（`www.`・`m.` つき、`?t=` などのクエリつきも含む）から VOD ID を取り出し、`https://www.twitch.tv/videos/<ID>` に正規化して保存する。
- `twitch.tv/videos/` に数字以外・ID なし、チャンネルのページ（`twitch.tv/<名前>`）、クリップ（`clips.twitch.tv`・`/clip/`）は、ジョブを作らず 400 と `invalid_url` を返す。これまで `unsupported_url` を返していた Twitch の URL は、上の形なら受け付ける。
- YouTube の URL の挙動は変えない。
- ジョブにはプラットフォーム（`youtube`／`twitch`）を持たせる。同じ VOD の重複登録の防止は、プラットフォームごとに行う（`failed` 以外は1動画1件）。既存の行は `youtube` として扱う。

### 取得と集計
- Twitch のチャットは、取得部分（`ChatFetcher`）の Twitch 版で取得する。ジョブのプラットフォームで取得方法を切り替える。テストはネットワークを使わず、保存済みのサンプルで行う。
- 各コメントを、YouTube と同じ `chat_messages`（動画内の時刻ミリ秒・ユーザー名・本文）に保存し、同じ30秒区間の集計（`chat_buckets`）を作る。集計・一覧・絞り込み・グラフ（#4・#5）は、プラットフォームによらず同じ動き。
- 時刻は、VOD の先頭からの秒数（`content_offset_seconds`）をミリ秒にして使う。負の時刻は除く。
- ユーザー名は表示名（display name）、なければログイン名。本文はコメント全体の文字列（エモートは名前の文字のまま）。
- 完了時の `jobs.result` に、プラットフォーム・動画 ID・タイトル・コメント総数・最終区間を入れる（YouTube の既存の形に `platform` を足す）。
- タイトルの取得に Twitch の Helix API を使う（要 Client ID／Secret）。タイトルが取れなくても、チャットが取れていれば分析は成功させ、タイトルは「Twitch VOD <ID>」にする。

### 失敗の理由（`jobs.error`）
- `no_chat`：コメントが0件、またはチャットが削除済み
- `video_unavailable`：VOD が存在しない・削除済み・サブスクライバー限定
- `fetch_failed`：その他の取得失敗（タイムアウト・Twitch の応答エラー）
- `fetch_blocked`：Twitch に止められた（429 など）
- Client ID／Secret の値は、ログ・エラー文・`jobs.error` に出さない。
- 原因の違うものを1つの理由にまとめない。

### 再生（分析画面）
- Twitch のジョブでは、YouTube のプレイヤーの代わりに Twitch の埋め込みプレイヤー（公式の Embed Interactive API）を表示する。
- グラフの棒やチャットの行をクリックすると、その時刻に移動して再生する。準備前のクリックは、準備ができてから反映する（YouTube と同じ）。
- 現在の再生位置（チャット一覧の「いまの位置へ」）が Twitch でも動く。
- プレイヤーが読み込めないとき、または自動再生が止められたときは、Twitch で開くリンク（`?t=<h>h<m>m<s>s`）つきの案内を出す。
- 埋め込みには親ドメイン（`parent`）の指定が要る。表示中のホスト名を使う。
- `noChatVideo`（チャットなしの動画も再生する）の扱いも Twitch で同じにする。

### 入力画面
- トップと分析画面の URL 入力の文言・例を、YouTube と Twitch の両方に対応した形にする。

## 範囲外

- Twitch のライブ配信中の分析、クリップ、ユーザーのログイン連携（#7）
- Twitch の表示名の色・バッジ・エモート画像
- 実機でのプレイヤー再生の確認の一部（Twitch の埋め込みは本番ドメインを `parent` に要するため、手元では `localhost` で確かめる）

## 仮定

1. **チャットの取得は、Twitch の公式 Helix API には VOD のチャット取得がないため、旧版と同じく Twitch の Web が使う非公式の GraphQL（VideoCommentsByOffsetOrCursor）を使う。** 仕様変更で動かなくなる可能性があり、その場合は `fetch_failed` として見える。公式 API ではないこと・不安定さは承認時に確認してもらう。Client ID は Web 用の公開値ではなく、オーナーの開発者アプリの値を使う（Helix のタイトル取得用）。GraphQL 側に必要な公開の Client ID は定数としてコードに置く。
2. 取得は TypeScript の `fetch` で行い、yt-dlp は使わない（新しい外部ツールは増えない）。
3. 環境変数 `TWITCH_CLIENT_ID`・`TWITCH_CLIENT_SECRET` を使う。値は `.env`（コミットしない）とホスト側の Secret に登録し、Issue・PR・ログには書かない。`compose.yaml` には変数名だけを足す。登録はオーナーのお願い事項として PR に書く。未設定でもチャット取得はでき、タイトルだけが代わりの文言になる（チャット取得に Secret は要らない）。
4. DB は `jobs.platform` の追加と、重複防止の一意制約の作り直しのマイグレーション（リスク high：人の承認でマージ）。
5. 実際の Twitch への通信による確認は、手元の環境で取れるか試して結果を書く。取れなければ「未確認」と書き、サンプルでのテストを根拠にする。
6. 画面の見た目は変えない（プレイヤー部分の差し替えと文言のみ）。新しい見た目の方向性ではないので design は使わない。
