# Claude と Codex の共同開発ルール

このリポジトリは Claude Code と Codex の両方で開発します。2つの AI が役割を分けて、衝突せずに、人の承認を待たずに進めるためのルールです。ユーザーがその場で別の指示をしたときはそちらを優先し、このファイルも更新します。

## 1. どちらが担当するか

| 作業 | 担当 | 確かめる側 |
| --- | --- | --- |
| Issue の仕分け、仕様化、実装計画 | Claude Code | Codex（spec-check・計画への意見） |
| 複数ファイル・複数画面にまたがる実装 | Claude Code | Codex（review、画面の変更は ui-review も） |
| 新しい見た目の案（design） | Claude Code | オーナーが選ぶ |
| 動作確認、PR 作成、マージ判定、リリース、障害対応 | Claude Code | 機械（CI・監視） |
| 1か所で済む小さな修正、原因がわかっている小さな不具合 | Codex | Claude Code（review） |
| 依存更新、文言修正、テスト追加などの定型作業（chore） | Codex | Claude Code（review） |
| 重要なタスクで、実装方針が割れそうなもの | 両方が別ブランチで実装 | テスト結果と差分量で比べ、良い方を採用 |

triage スキルが Issue に `codex` ラベルを付けたものは Codex、それ以外は Claude Code が担当します。Codex への依頼は、Issue への `@codex` のコメントで行います（ラベルだけでは Codex は動きません）。Codex が24時間たっても PR を出さなければ、groom が Claude に引き継ぎます。

## 2. 1つの作業は1つのブランチ、1人の担当

- 作業ごとにブランチを分けます。Claude は `claude/…`、Codex は `codex/…` という名前にします。
- 1つのブランチを Claude と Codex が同時に編集しません。担当を替えるときは、先にコミットして push してから渡します。
- もう一方のブランチには、コメント（レビュー）だけを書きます。

## 3. 作業の始め方と終わり方

**始めるとき**

1. `git status` で未コミットの変更がないか確かめます。他方の変更が残っていたら触らず、Issue にコメントして別の作業に移ります。
2. 最新の main から作業ブランチを作ります。
3. 対応する Issue を読み、`in-progress` ラベルを付けます。

**終えるとき（途中で止まるときも）**

1. 変更をコミットして push します。未完成でもコミットし、PR か Issue に「未完了」と書きます。未コミットのまま終わりません。
2. 次の「引き継ぎメモ」を PR の説明（なければ Issue のコメント）に書きます。
   - やったこと／やっていないこと
   - 置いた仮定
   - 実行した確認と結果、実行できなかった確認
   - 次に呼ぶスキル

## 4. タスクの管理（GitHub Issues）

- **1タスク＝1 Issue**。本文に「やりたいこと」と「完了条件」を書きます。完了条件がなければ spec スキルが補います。
- **ラベル**（`scripts/setup-github.sh` で作ります）
  - 担当：`agent`（AI に任せる）、`codex`（Codex 担当）
  - リスク：`risk:low`、`risk:medium`、`risk:high`
  - 状態：`in-progress`、`needs-human`（人の判断待ち）、`blocked`（利用上限などで保留）
  - 種類：`feature`、`bug`、`chore`、`incident`
- **作業との結びつけ**：PR の説明に `Closes #番号` を書き、マージで自動的に閉じます。
- パスワード・API キー・実名・個人情報は Issue に書きません。

## 5. レビュー

- すべての PR を、作った側と別の AI がレビューします（review スキル）。
  - Claude Code が作った PR：Codex の GitHub 自動レビュー、または PR に `@codex review` とコメント。画面の変更があるときは、`@codex` に ui-review スキルで画面を確かめるよう続けて頼みます。
  - Codex が作った PR：Claude Code が review スキルでレビュー。PR が開くと `.github/workflows/claude-code-review.yml` が自動で動きます（`claude/` ブランチの PR では動きません）。
- 指摘への対応（address スキル）と再レビューの往復は **2回まで** です。決着しないときは、両者の主張と推奨案を PR にまとめて escalate します。
- 手元（Mac）で Codex にレビューを頼むとき：

```sh
git diff origin/main...HEAD | scripts/ai --review "この diff をレビューして、問題点を日本語で簡潔に挙げて"
```

## 6. 利用上限に当たったとき

サブスクの利用上限に当たったら、次のようにします（API キーは使いません）。

- **片方が上限**：もう一方が代わりに担当します。レビューを代わったときは PR に「Codex（または Claude）のレビューは未実施、代わりに〇〇がレビュー」と書きます。
- **両方が上限**：作業中のブランチをコミット・push し、Issue に `blocked` ラベルと引き継ぎメモを残して止まります。`scripts/notify` で通知します。上限が戻ったら、定期実行（groom）が `blocked` の Issue から再開します。
- 手元では `scripts/ai` を使うと、Codex が上限・混雑のとき自動で Claude に回ります。

```sh
scripts/ai "README の誤字を直して"                     # 修正を頼む
git diff origin/main...HEAD | scripts/ai --review "レビューして"   # 読み取りだけ
```

## 7. 使う量を抑えるコツ

- 小さな修正は Codex に直接回します（triage が `codex` ラベルを付ける）。
- Claude Code には、仕様化から実装までをまとめて任せます。
- 両方で並列実装するのは、重要で方針が割れそうなタスクだけにします。
