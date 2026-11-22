import { defineConfig } from "@playwright/test";

// 画面の通しテスト。Postgres（E2E_DATABASE_URL か DATABASE_URL）とビルド済みの web を使い、外部にはつながない。
// 実行: npm run build && npm run test:e2e
const PORT = Number(process.env.E2E_PORT ?? 3100);
const db = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "ja-JP" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { DATABASE_URL: db },
  },
});
