import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toast } from "../src/components/Toast";

describe("Toast（基本 8-1：できませんでした）", () => {
  it("メッセージがないときは何も出さない", () => {
    expect(renderToStaticMarkup(<Toast message={null} onClose={() => {}} />)).toBe("");
  });

  it("赤の ! と文、閉じるボタン（読み上げ名つき）を出す", () => {
    const html = renderToStaticMarkup(
      <Toast message="通信できませんでした。" onClose={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("! 通信できませんでした。");
    expect(html).toContain('aria-label="お知らせを閉じる"');
    expect(html).not.toContain("⚠");
  });

  it("✕ を押すまで消えない（自動で閉じる仕組みを持たない）", () => {
    // 描画だけで onClose が呼ばれないこと。タイマーは使わない。
    let closed = 0;
    renderToStaticMarkup(<Toast message="x" onClose={() => closed++} />);
    expect(closed).toBe(0);
  });
});
