# 技術スタック

新しいアプリを始めるときは stack-select スキルで選びます。迷わないように、自走しやすい標準構成を用意しています。特別な理由がなければ標準構成を使います。

## 1. 選ぶ基準

自走（人の承認なしで本番まで出す）を支えるため、次を満たすものを優先します。

1. **PR ごとのプレビュー環境**が自動で作られる（verify が実物で確かめられる）
2. **段階公開と即ロールバック**ができる（壊れても自動で戻せる）
3. **PR ごとに DB を分けられる**（本番データに触らずに試せる）
4. **型やスキーマで AI のミスを機械的に見つけられる**
5. **AI がよく知っている**（情報量が多く、生成の質が安定する）
6. **無料枠かサブスクの範囲で始められる**

## 2. 標準構成

| 層 | 標準 | 選ぶ理由 | 代わりの候補 |
| --- | --- | --- | --- |
| 言語 | TypeScript | 画面からサーバーまで1言語。型チェックで AI のミスが CI で止まる | Python |
| フレームワーク | Next.js | 情報量が多く AI が書き慣れている。画面と API をまとめて持てる | Hono、Django |
| ホスティング | Vercel | PR ごとのプレビュー、段階公開、即ロールバックが標準 | Cloudflare、自前サーバー |
| DB | Neon（Postgres） | PR ごとに DB をブランチできる | Supabase |
| ORM | Drizzle | スキーマが TypeScript で、マイグレーションの差分が読みやすい | Prisma |
| UI | Tailwind CSS（色・寸法は [配色](design/colors.md) の CSS 変数を使う）、アイコンは Lucide | 共通部品を作りやすく、ルールの変数をそのまま使える | CSS Modules |
| テスト | Vitest、Playwright | 単体テストと画面操作のテストを verify が自動で回せる | ― |
| Lint・整形 | Biome | 1つの道具で Lint と整形が済み、速い | ESLint + Prettier |
| エラー監視 | Sentry | 異常を検知して incident と自動ロールバックの引き金にできる | ― |
| 通知 | Discord（Webhook） | 設定が URL 1つで済む | LINE（Messaging API） |

各サービスの無料枠・機能・料金は変わりやすいので、stack-select の時点で公式の最新情報を確かめます。

## 3. スタックを決めたらやること

stack-select スキルが次を行います。

1. このファイルの「採用したスタック」に、選んだものと理由を書く
2. `scripts/check` に、テスト・型チェック・Lint・ビルドのコマンドを書く
3. `.github/workflows/release.yml` に、ステージング確認と本番の段階公開・ロールバックの手順を書く
4. 高リスクのファイル（マイグレーション・認証・課金・インフラ）を `CODEOWNERS` に足す
5. [配色](design/colors.md) の変数を CSS の `:root` に書き、[部品 5](design/components.md#5-共通部品を使い回す) の共通部品を置くフォルダと見本帳を決める
6. design スキルで最初の画面と配色を選んでもらい、[デザインのルール](design/README.md) の「使う人」の表を埋める
7. プロジェクト固有のスキル（業務ロジックの検証など）が必要なら `.agents/skills/` に足す

## 4. 採用したスタック

確かめた日：2026-11-12（Issue #1）。有料のサービスは使いません。

作るもの：YouTube／Twitch のアーカイブのチャットを取得し、コメント数の推移とチャット一覧を見せる Web アプリ（[#1](https://github.com/gati-hxmx/cometrix-v2/issues/1)）。当面はオーナーの Mac で動けばよく、いずれ画面・API・ワーカー・Postgres をすべて VPS に置きます。

| 層 | 採用 | 標準との違いと理由 |
| --- | --- | --- |
| 言語 | TypeScript（画面・API・ワーカーすべて） | 標準どおり。取得は yt-dlp と TwitchDownloaderCLI を外部コマンドとして呼ぶだけなので、ワーカーを Python にする利点が小さく、1言語にそろえた |
| フレームワーク | Next.js（画面と API）。ワーカーは同じリポジトリの別プロセス（`src/worker/`） | 標準どおり。数分かかる取得は画面と分け、ワーカーが動かす |
| 実行環境 | Docker Compose（web・worker・db・migrate）。`docker compose up --build` で起動 | 標準の Vercel は使わない（オーナーの判断：VPS に置く）。同じコンテナをそのまま VPS に持っていける |
| DB | Postgres 17（コンテナ） | Neon の代わり。PR ごとの DB ブランチは本番を作るとき（#12）まで後回し |
| ジョブの受け渡し | Postgres の `jobs` 表（Redis は使わない） | 構成を増やさないため。分析結果も DB に保存する |
| ORM | Drizzle | 標準どおり。マイグレーションは `drizzle/` に出す |
| UI | 配色の変数は `src/app/globals.css` の `:root` | Tailwind・Lucide は最初の画面を決める（#2）ときに入れる |
| テスト | Vitest | Playwright は最初の画面ができたときに足す |
| Lint・整形 | Biome（対象は `src/`・`tests/`・ルートの設定ファイル） | 標準どおり。文書やスキルは整形しない |
| CI | GitHub Actions で `scripts/check`（公開リポジトリなので無料） | |

後回しにするもの（本番を作る #12 で決める）：ホスティング・PR ごとのプレビュー・段階公開とロールバック（`release.yml` は `AUTO_DEPLOY_ENABLED` を false のまま触らない）・Sentry・Discord 通知。

主なコマンド：`scripts/check`（型チェック・Lint・テスト・ビルド）、`npm run dev`（画面だけ手元で）、`npm run db:generate`（スキーマからマイグレーションを作る）。
