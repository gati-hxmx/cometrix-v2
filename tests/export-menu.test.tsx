import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ExportMenu } from "../src/components/ExportMenu";

// 書き出しの ⋮（#59）。閉じているときはボタンだけで、下の要素を押し出さない。
test("閉じているときは「書き出し」の ⋮ ボタンだけ", () => {
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
      onDone={() => {}}
      onError={() => {}}
    />,
  );
  expect(html).toContain('aria-label="書き出し"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="menu"');
});
