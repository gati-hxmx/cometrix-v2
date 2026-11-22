import { expect, test } from "vitest";
import { generateStaticParams } from "../src/app/icons/[name]/route";
import manifest from "../src/app/manifest";
import { sharedUrl } from "../src/lib/share";

// マニフェストと、アイコンの作り先・共有の受け先がずれないようにする（#70）。
test("マニフェストのアイコンは、すべてアイコンの作り先で作られる", () => {
  const names = new Set(generateStaticParams().map((p) => `/icons/${p.name}`));
  for (const icon of manifest().icons ?? []) expect(names.has(icon.src)).toBe(true);
});

test("共有の受け先の欄の名前は、sharedUrl が読む名前と同じ", () => {
  const params = manifest().share_target?.params ?? {};
  for (const key of ["url", "text", "title"] as const) {
    const name = (params as Record<string, string>)[key];
    expect(name).toBeTruthy();
    expect(sharedUrl({ [name]: "https://youtu.be/aaaaaaaaaaa" })).toBe(
      "https://youtu.be/aaaaaaaaaaa",
    );
  }
});
