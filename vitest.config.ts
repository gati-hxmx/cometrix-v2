import { defineConfig } from "vitest/config";

// DB のテストは同じデータベースを共有し、各テストが jobs を空にするので、ファイルは順に実行する。
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], fileParallelism: false } });
