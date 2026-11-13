---
name: ship
description: 実装と動作確認の後、PR を作り、別の AI にレビューを依頼する。
---

# PR 作成（ship）

## 手順

1. 最新の main を取り込み、`scripts/check` が通ることを確かめて push する。
2. PR を作る。説明には次を書く（`.github/pull_request_template.md` の形）。
   - 何を・なぜ（`Closes #番号`）
   - リスク判定と理由
   - 置いた仮定
   - 確かめたこと（verify の結果表、画面の変更は 375・1024・1440px のスクリーンショット）と、確かめられなかったこと
   - 残した課題（別 Issue にしたものはリンク）
   - DB のマイグレーションがあるときは「戻すとき」：本番で戻すときはコードだけでなく DB も更新直前のバックアップに戻すこと、戻すと消えるもの（その PR の機能で入ったデータなど）、戻したあとに入れ直すもの
3. PR に `risk:*` ラベルを付ける（Issue と同じ）。
4. レビューを依頼する。
   - Claude Code が作った PR → Codex（自動レビュー、または `@codex review` とコメント）。画面・操作の変更があれば、あわせて「ui-review スキルで画面を確かめてください」と `@codex` にコメントする
   - Codex は bot のコメントには反応しないため、レビューが始まらなくても待たずに終えてかまいません。30分たっても始まらなければ、見張り（`.github/workflows/watchdog.yml`）が人の名前で頼み直します
   - Codex が作った PR → Claude Code に review を依頼（`@claude` で review スキルを使うようコメント）

## 次に呼ぶスキル

- review（別の AI が担当）
- CI が失敗したら fix-ci
