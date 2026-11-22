import { expect, test } from "@playwright/test";
import { blockExternal } from "./helpers";
import { clearJobs, completeJob, FIXTURE_TITLE, migrateDb, VIDEO_URL } from "./seed";

test.beforeAll(migrateDb);
test.beforeEach(async ({ page }) => {
  await clearJobs();
  await blockExternal(page);
});

test("URL を入れる → グラフ → 棒を押す → チャット一覧・メモ", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("配信の URL").fill(VIDEO_URL);
  await page.getByRole("button", { name: /分析/ }).first().click();
  await page.waitForURL(/\/analysis\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop() as string;

  // 取得ワーカーの代わりに、仮データを入れて done にする。
  await expect(page.getByRole("heading", { name: "分析中…" })).toBeVisible();
  await completeJob(id);

  await expect(page.getByRole("heading", { name: FIXTURE_TITLE })).toBeVisible({ timeout: 15_000 });
  const bars = page.getByRole("button", { name: /から/ });
  await expect(bars.first()).toBeVisible();

  // 山の棒（5本目＝120〜150秒）を押す。
  await bars.nth(4).click();
  await expect(bars.nth(4)).toHaveAttribute("aria-pressed", "true");

  const chat = page.getByRole("region", { name: "チャット" });
  await expect(chat).toContainText("山のコメント");

  await page.getByRole("tab", { name: "メモ" }).click();
  const memo = page.getByRole("textbox", { name: "メモ" });
  await memo.fill("ここが盛り上がった");
  await expect(memo).toHaveValue("ここが盛り上がった");
});

test("URL でない文字列は送れず、案内が出る", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("配信の URL").fill("これはURLではない");
  await expect(page.getByText(/YouTube の配信アーカイブか/)).toBeVisible();
  await expect(page.getByRole("button", { name: /分析/ }).first()).toBeDisabled();
});

test("存在しない分析 ID は見つからない画面になる", async ({ page }) => {
  await page.goto("/analysis/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("分析が見つかりません。")).toBeVisible();
});
