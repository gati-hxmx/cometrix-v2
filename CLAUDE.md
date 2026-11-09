# Claude Code 用の入口

このリポジトリの開発ルールは、Codex と Claude Code で共通の [AGENTS.md](AGENTS.md) にまとめています。

@AGENTS.md

## Claude Code だけのこと

- スキルの本体は `.agents/skills/` です。`.claude/skills/` はそこへのリンクなので、編集は `.agents/skills/` 側で行います。
- あなたは進行役です。スキルが終わったら、そのスキルの「次に呼ぶスキル」に従って次へ進みます。人の返事を待つのは escalate スキルを使ったときだけです。
- Codex にレビューや意見を頼むときは、GitHub の PR に `@codex review` とコメントするか、手元では `scripts/ai --review` を使います（[共同開発ルール](docs/ai-collaboration.md)）。
- hooks（`.claude/settings.json`）がブロックした操作は、回避せずに理由を PR に書き、必要なら escalate します。
