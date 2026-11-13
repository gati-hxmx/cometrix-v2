# セットアップ

このテンプレートを動かすために、人が一度だけ行う設定です。API キーは使わず、Claude と ChatGPT（Codex）のサブスクだけで動かします。画面の名前や手順は変わることがあるので、見つからないときは各サービスの公式ドキュメントを確かめてください。

## 1. GitHub

1. このリポジトリを **テンプレート** にします（Settings → General → 「Template repository」にチェック）。新しいアプリは「Use this template」から作ります。
2. Claude の GitHub App をこのリポジトリ（またはテンプレートから作った各リポジトリ）にインストールします。手元の Claude Code で `/install-github-app` を実行すると、App のインストールと Secret の登録まで案内されます。
3. GitHub Actions からサブスクで Claude Code を動かすため、手元で `claude setup-token` を実行し、表示されたトークンを Secret `CLAUDE_CODE_OAUTH_TOKEN` に登録します（Settings → Secrets and variables → Actions）。
4. ラベル・ブランチ保護・自動マージの設定を、手元で次のコマンドで一度に作ります（`gh` でログイン済みであること）。

```sh
scripts/setup-github.sh gati-hxmx/<リポジトリ名>
```

これで次が設定されます。

- ラベル（`agent`・`codex`・`risk:*`・`needs-human`・`blocked` など）
- main のルール：直接 push 禁止、CI 必須、`CODEOWNERS` に載ったファイルの変更は持ち主の承認必須
- 自動マージの許可、マージ後のブランチ自動削除

## 2. Codex

1. Codex のクラウド（ChatGPT の Codex 画面）で GitHub を接続し、このリポジトリを使えるようにします。
2. Codex の設定で、このリポジトリの **自動コードレビュー** を有効にします。PR が開くと Codex がレビューします。
3. Codex のクラウドの環境（このリポジトリ用）を作っておきます。Issue に `@codex` とコメントされると、その環境で作業して PR を出します。動かない場合も、24時間後に groom が Claude に引き継ぐので作業は止まりません。
4. 手元の Codex CLI は ChatGPT アカウントでログインしておきます（`codex login`）。`scripts/ai` の予備として使います。

5. Codex は bot（Claude の GitHub App）が書いた `@codex review` には反応しません。見張り（`.github/workflows/watchdog.yml`）が人の名前で頼み直せるように、GitHub のトークンを Secret `CODEX_REQUEST_TOKEN` に登録します。
   - GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access：Codex にレビューしてもらうリポジトリだけを選ぶ
   - Permissions：**Pull requests** を Read and write（ほかは不要）
   - できたトークンを、各リポジトリの Secret `CODEX_REQUEST_TOKEN` に登録します（Settings → Secrets and variables → Actions）。期限が切れたら作り直します
   - 未登録でも止まりはしません。Codex のレビューが始まらないときは、Claude が代わりにレビューします

Codex はリポジトリの `AGENTS.md` と `.agents/skills/` を読みます。

## 3. 通知（Discord）

1. 通知を受けたい Discord のチャンネルで、「チャンネルの編集 → 連携サービス → ウェブフック」から Webhook を作り、URL をコピーします。
2. GitHub の Secret `DISCORD_WEBHOOK_URL` に登録します。
3. 手元から通知を試すときは、環境変数に入れて実行します。

```sh
DISCORD_WEBHOOK_URL=... scripts/notify "テスト通知です"
```

LINE にしたい場合は、LINE Notify が 2025年3月に終了しているため、LINE Messaging API の公式アカウントとチャネルアクセストークンが必要です。`scripts/notify` に送り先を足します。

## 4. 定期実行

毎日の groom（タスク発掘・保留の再開）と毎週の retro（振り返り）は、`.github/workflows/agent.yml` の schedule で動きます。止まった作業の自動再開は `.github/workflows/watchdog.yml` が15分ごとに行います（[自走ワークフロー](workflow.md#5-止まったときの自動再開)）。Claude Code のルーティンで動かしたい場合は、schedule を消してルーティンに同じ指示を登録します。

## 5. 手元（Mac）

- Claude Code（デスクトップ）と Codex CLI を入れておきます。
- `scripts/ai` を Claude Code から実行するときは、`/permissions` で `Bash(scripts/ai:*)` を許可します。

## 6. 新しいアプリを始めるとき

1. 「Use this template」で新しいリポジトリを作る
2. 上の 1〜3 を新しいリポジトリにも行う（Secret とラベル・ルール）
3. 「作りたいもの」を書いた Issue を立て、`agent` ラベルを付ける。triage が stack-select から始めます
