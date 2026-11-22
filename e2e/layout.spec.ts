import { expect, test } from "@playwright/test";
import { blockExternal, overflowPx, WIDTHS } from "./helpers";
import { clearJobs, completeJob, FIXTURE_TITLE, migrateDb, openDb, VIDEO_URL } from "./seed";
import { jobs } from "../src/db/schema";

test.beforeAll(migrateDb);

for (const width of WIDTHS) {
  test(`${width}px：トップと分析画面で横にはみ出さない（写真を e2e-screenshots/ に出す）`, async ({
    page,
  }) => {
    await clearJobs();
    await blockExternal(page);
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/");
    await expect(page.getByLabel("配信の URL")).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/top-${width}.png`, fullPage: true });
    expect(await overflowPx(page)).toBeLessThanOrEqual(0);

    const { sql, db } = openDb();
    const [job] = await db
      .insert(jobs)
      .values({ url: VIDEO_URL, videoId: "aaaaaaaaaaa", status: "queued" })
      .returning({ id: jobs.id });
    await sql.end();
    await completeJob(job.id);

    await page.goto(`/analysis/${job.id}`);
    await expect(page.getByRole("heading", { name: FIXTURE_TITLE })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("region", { name: "チャット" })).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/analysis-${width}.png`, fullPage: true });
    expect(await overflowPx(page)).toBeLessThanOrEqual(0);
  });
}
