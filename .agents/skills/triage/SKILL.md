---
name: triage
description: Issue が立ったとき、または agent ラベルが付いたときに、リスク判定・担当・優先度・次の工程を決める。自走ワークフローの入口。
---

# 仕分け（triage）

Issue を読み、誰がどの工程から進めるかを決めます。判定はすべて [リスク基準](../../../docs/risk-policy.md) に従います。

## 手順

1. Issue の本文・コメント・関連 Issue を読む。既に `in-progress` や `needs-human` が付いていれば、最後のコメントの「次に呼ぶスキル」から再開する。
2. 種類を決めてラベルを付ける：`feature`・`bug`・`chore`・`incident`。
3. リスクを判定して `risk:low`／`risk:medium`／`risk:high` を付ける。迷ったら高い方。
4. 担当を決める。
   - 1か所で済む小さな修正、依存更新、文言修正、テスト追加 → `codex` ラベルを付け、Issue に「@codex chore スキルで、この Issue を `codex/<番号>-<短い名前>` ブランチで直して PR を作ってください」とコメントする（Codex のクラウドタスクが始まる）。24時間たっても Codex の PR がなければ、groom が Claude に引き継ぐ。
   - それ以外 → Claude Code が担当。
   - リポジトリにまだアプリがない（技術スタックが [技術スタック](../../../docs/stack.md) の「採用したスタック」に書かれていない）→ stack-select へ。
5. 同じ内容の Issue がないか探し、重複なら理由を書いて閉じる。
6. Issue にコメントする：種類・リスク・担当・理由・次に呼ぶスキル。

## 次に呼ぶスキル

- 技術スタック未決定 → stack-select
- `codex` ラベル → chore（Codex が担当）
- それ以外 → spec
