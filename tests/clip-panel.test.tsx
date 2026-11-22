import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClipPanel } from "../src/components/ClipPanel";

describe("ClipPanel（範囲）", () => {
  it("最初は空の案内、［追加］は押せず、ここから・ここまで・なぞるがある", () => {
    const html = renderToStaticMarkup(
      <ClipPanel
        jobId="j"
        getTime={() => 0}
        onSeek={() => {}}
        onError={() => {}}
        picked={null}
        onPickMode={() => {}}
        onMark={() => {}}
      />,
    );
    expect(html).toContain("範囲はまだありません");
    expect(html).toContain("ここから");
    expect(html).toContain("ここまで");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>＋ 追加/);
  });
});
