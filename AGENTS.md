# 開発ガイド（Claude Code・Codex 共通）

このファイルは Claude Code と Codex の両方が最初に読む、このリポジトリの開発ルールです。Claude Code は [CLAUDE.md](CLAUDE.md) からこのファイルを読み込みます。ルールを変えるときはこのファイルだけを直します。

このリポジトリは「人の承認を待たずに、Issue から本番まで AI が進める」ことを前提にしています。人が入るのは [リスク基準](docs/risk-policy.md) の「高リスク」・新しい見た目の方向性を選ぶとき・AI 同士で決着しないときだけです。

**いちばん大事にするのは、画面の使いやすさと見た目です。** 画面を作る・変えるときは、必ず [デザインのルール](docs/design/README.md) を読んでから作ります。

## 1. 仕様の参照先

- 画面・UI のルール（最優先）：[デザインのルール](docs/design/README.md)（[画面づくりの基本](docs/design/layout.md)・[部品づくり](docs/design/components.md)・[配色](docs/design/colors.md)・[アイコン](docs/design/icons.md)）。画面ごとの仕様は `docs/screens/<画面>.md`
- 全体の流れ・スキルのつながり：[自走ワークフロー](docs/workflow.md)
- Claude と Codex の分担・ブランチ・引き継ぎ：[共同開発ルール](docs/ai-collaboration.md)
- 人が入る条件・自動マージの条件：[リスク基準](docs/risk-policy.md)
- 技術スタックの標準と選び方：[技術スタック](docs/stack.md)
- 初期設定（GitHub・Discord・サブスク連携）：[セットアップ](docs/setup.md)
- タスクは GitHub Issues で管理します。1タスク＝1 Issue。運用は [共同開発ルール](docs/ai-collaboration.md) の「タスクの管理」。
- ユーザーの明示的な指示は、このファイルや過去の資料より優先します。指示でルールが変わったら、該当文書も同じ PR で更新します。

## 2. 進め方の原則

- **止まらない**：仕様があいまいなときは、もっとも妥当な解釈を選んで「仮定」として PR と Issue に書き、先へ進みます。人に聞くのは、仮定が外れたときの作り直しが大きい場合だけです（[リスク基準](docs/risk-policy.md)）。
- **作った側と別の AI が確かめる**：Claude Code が作ったものは Codex が、Codex が作ったものは Claude Code がレビューします。
- **機械で確かめる**：完了の判断はテスト・型チェック・Lint・ビルドの結果で行います。「動くはず」で完了にしません。
- **経緯を GitHub に残す**：判断の理由、仮定、確認結果は Issue と PR に書きます。セッションが切れても、別の AI が続きから再開できる状態にします。
- **画面はルールと共通部品で作る**：配置・部品・色・アイコンは `docs/design/` のとおりにし、画面ごとに似た部品や色を作りません。ルールに形がない新しい見た目は、design スキルで案を出してオーナーに選んでもらいます。既存のルールの組み合わせで作れる画面は、そのまま自走で作ります。
- **依頼の範囲を守る**：Issue の完了条件を満たす最小の変更にします。関係のない改善は別の Issue に起こします。

## 3. 完了の定義

次をすべて満たしたときだけ「完了」とします。

1. Issue の完了条件（受け入れ条件）をすべて満たしている
2. `scripts/check` が通る（テスト・型チェック・Lint・ビルド。プロジェクトで定義したもの）
3. 画面や操作が変わる場合は、実際に動かして [基本 10 の確認のしかた](docs/design/layout.md#10-確認のしかた) をすべて確かめた（verify スキル）
4. 作った側と別の AI のレビュー（画面の変更は ui-review も）で、未解決の指摘がない
5. 仮定・未確認の点・残した課題が PR に書かれている

## 4. 禁止事項

- テストを消す・スキップする・期待値を実装に合わせて書き換えることで、CI を緑にしない
- main へ直接 push しない。force push しない
- 秘密情報（パスワード・API キー・トークン・個人情報）をコード・Issue・PR・ログに書かない。`.env` を編集・コミットしない
- 高リスクの変更を、人の承認なしにマージしない（[リスク基準](docs/risk-policy.md)）
- 自分の安全装置（`.claude/settings.json` の hooks と権限、`.github/workflows/`、`CODEOWNERS`、`docs/risk-policy.md`）を、人の承認なしに弱めない
- 同じブランチを Claude と Codex が同時に編集しない

## 5. 検証

プロジェクトルートで次を実行します。

```sh
scripts/check
```

`scripts/check` は、プロジェクトに定義されたテスト・型チェック・Lint・ビルドを順に実行します（中身は技術スタックを決めたときに書きます。[技術スタック](docs/stack.md)）。

- 変更に関係するテストから確認し、計算・権限・状態遷移の変更には期待する振る舞いを検証するテストを追加します。
- 表示の変更はブラウザで 375・1024・1440px を確かめ、テスト成功だけで見た目を確認済みとしません。
- 実行した確認と結果、実行できなかった確認を PR に書きます。
- 文書・スキルだけの変更では、リンクと形式を確認します（`scripts/check` が自動で行います）。

## 6. スキル

開発の各工程はスキルとして `.agents/skills/` に置いています（`.claude/skills/` はそこへのリンク。編集は `.agents/skills/` 側で行います）。各スキルは最後に「次に呼ぶスキル」を決めて引き継ぎます。一覧とつながりは [自走ワークフロー](docs/workflow.md) を見てください。

| スキル | 役割 |
| --- | --- |
| [triage](.agents/skills/triage/SKILL.md) | Issue の仕分け（リスク判定・担当・優先度） |
| [stack-select](.agents/skills/stack-select/SKILL.md) | 新しいアプリの技術スタック選定 |
| [spec](.agents/skills/spec/SKILL.md) | 要望を受け入れ条件付きの仕様にする |
| [spec-check](.agents/skills/spec-check/SKILL.md) | 仕様の抜け漏れ・矛盾を指摘する（Codex） |
| [design](.agents/skills/design/SKILL.md) | 新しい見た目の案をスマホ・PC で出し、オーナーに選んでもらってルールにする |
| [plan](.agents/skills/plan/SKILL.md) | 実装計画とリスクの洗い出し |
| [implement](.agents/skills/implement/SKILL.md) | テスト先行で実装し、検証を通す |
| [verify](.agents/skills/verify/SKILL.md) | 実際に動かして受け入れ条件を確かめる |
| [ship](.agents/skills/ship/SKILL.md) | PR を作り、レビューを依頼する |
| [review](.agents/skills/review/SKILL.md) | 作った側と別の AI がコードをレビューする |
| [ui-review](.agents/skills/ui-review/SKILL.md) | 作った側と別の AI が、画面をデザインのルールに照らして確かめる |
| [address](.agents/skills/address/SKILL.md) | レビュー指摘に対応する |
| [fix-ci](.agents/skills/fix-ci/SKILL.md) | CI の失敗を再現して直す |
| [merge-gate](.agents/skills/merge-gate/SKILL.md) | 自動マージしてよいか判定する |
| [release](.agents/skills/release/SKILL.md) | ステージング確認と本番の段階公開 |
| [incident](.agents/skills/incident/SKILL.md) | 本番の異常に対応する |
| [chore](.agents/skills/chore/SKILL.md) | 小さな定型作業（主に Codex） |
| [groom](.agents/skills/groom/SKILL.md) | ログ・失敗テスト・TODO からタスクを起こす |
| [retro](.agents/skills/retro/SKILL.md) | 失敗の傾向からスキルとルールを改善する |
| [escalate](.agents/skills/escalate/SKILL.md) | 人に判断を仰ぐ |

依頼に合うスキルだけを使います。プロジェクト固有のスキル（例：業務ロジックの検証）は、同じ形式で `.agents/skills/` に追加します。

## 7. Claude と Codex の役割分担

詳しくは [共同開発ルール](docs/ai-collaboration.md)。要点は次のとおりです。

- **Claude Code**：進行役。仕様化・計画・実装・動作確認・PR 作成・マージ判定・リリース・障害対応。
- **Codex**：確かめる役。仕様チェック・コードレビュー・Claude が作った画面の ui-review。加えて、1か所で済む小さな修正・依存更新などの定型作業。
- 1つの作業は1つのブランチ、担当は1人です（`claude/…`・`codex/…`）。
- 片方が利用上限のときは、もう一方が代わりに行い、そのことを PR に書きます。両方上限なら作業を保留にして通知します。
