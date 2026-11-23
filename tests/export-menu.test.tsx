import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ExportMenu } from "../src/components/ExportMenu";

// 書き出しの ⋮（#59）。閉じているときはボタンだけで、下の要素を押し出さない。共有リンク（#68）も同じメニュー。
test("閉じているときは「書き出しと共有」の ⋮ ボタンだけ", () => {
  const html = renderToStaticMarkup(
    <ExportMenu
      jobId="j"
      title="t"
      videoUrl="https://www.youtube.com/watch?v=aaaaaaaaaaa"
      durationSec={60}
      filterQuery=""
      filtering={false}
      toc={[]}
      unit="件"
      graph={null}
      shareToken={null}
      onShareToken={() => {}}
      onDone={() => {}}
      onUndoable={() => {}}
      onError={() => {}}
    />,
  );
  expect(html).toContain('aria-label="書き出しと共有"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="menu"');
});
