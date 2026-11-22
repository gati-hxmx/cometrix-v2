import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeButton } from "../src/components/ResumeButton";

describe("ResumeButton（#20：自動再生が止められたとき）", () => {
  it("「▶ m:ss から再生」の button を出す", () => {
    const html = renderToStaticMarkup(<ResumeButton sec={83} onPlay={() => {}} />);
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("▶ 0:01:23 から再生");
  });

  it("1時間以上も同じ h:mm:ss の形で出す", () => {
    const html = renderToStaticMarkup(<ResumeButton sec={3725} onPlay={() => {}} />);
    expect(html).toContain("1:02:05 から再生");
  });

  it("高さ 44px 以上", () => {
    const html = renderToStaticMarkup(<ResumeButton sec={0} onPlay={() => {}} />);
    expect(html).toContain("min-height:44px");
  });
});
