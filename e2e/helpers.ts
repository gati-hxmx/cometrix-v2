import type { Page } from "@playwright/test";

/** 外の YouTube・Twitch などにはつながない。アプリ自身（localhost）以外は遮断する。 */
export async function blockExternal(page: Page) {
  await page.route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    (route) => route.abort(),
  );
}

export const WIDTHS = [375, 1024, 1440] as const;

/** 横スクロールが出ていないか（はみ出し 0）。 */
export async function overflowPx(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
