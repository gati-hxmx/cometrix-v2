import { expect, test } from "vitest";
import { sharedUrl } from "../src/lib/share";

// 共有の受け先（#70）。どの欄に URL が来ても拾う。
test("url の欄の URL を使う", () => {
  expect(sharedUrl({ url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" })).toBe(
    "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  );
});

test("text に文と一緒に入った URL を拾う（Android の YouTube）", () => {
  expect(
    sharedUrl({ title: "配信", text: "【雑談】夜の配信 https://youtu.be/aaaaaaaaaaa?si=xyz" }),
  ).toBe("https://youtu.be/aaaaaaaaaaa?si=xyz");
});

test("分析できる URL を優先し、なければ最初の URL。URL がなければ null", () => {
  expect(sharedUrl({ text: "https://example.com/a https://www.twitch.tv/videos/123456789" })).toBe(
    "https://www.twitch.tv/videos/123456789",
  );
  expect(sharedUrl({ text: "見て https://example.com/a" })).toBe("https://example.com/a");
  expect(sharedUrl({ text: "URL なし" })).toBeNull();
  expect(sharedUrl({})).toBeNull();
});

test("文の終わりの記号・全角のかっこは URL に含めない", () => {
  const v = "https://youtu.be/aaaaaaaaaaa";
  expect(sharedUrl({ text: `見て（${v}）` })).toBe(v);
  expect(sharedUrl({ text: `見て ${v}。` })).toBe(v);
  expect(sharedUrl({ text: `見て「${v}」` })).toBe(v);
  expect(sharedUrl({ text: `see (${v}).` })).toBe(v);
  expect(sharedUrl({ text: `${v}, ${v}!` })).toBe(v);
});

test("javascript: や data: は拾わない", () => {
  expect(sharedUrl({ url: "javascript:alert(1)" })).toBeNull();
  expect(sharedUrl({ url: "data:text/html,<b>x</b>" })).toBeNull();
  expect(sharedUrl({ text: 'x"><img src=x onerror=alert(1)>' })).toBeNull();
});

test("同じ名前が2回来たときも、分析できる方を選ぶ", () => {
  expect(sharedUrl({ url: ["https://example.com/a", "https://youtu.be/aaaaaaaaaaa"] })).toBe(
    "https://youtu.be/aaaaaaaaaaa",
  );
});

test("どれも分析できるときは url → text → title の順", () => {
  expect(
    sharedUrl({
      title: "https://youtu.be/ccccccccccc",
      text: "https://youtu.be/bbbbbbbbbbb",
      url: "https://youtu.be/aaaaaaaaaaa",
    }),
  ).toBe("https://youtu.be/aaaaaaaaaaa");
  expect(
    sharedUrl({ title: "https://youtu.be/ccccccccccc", text: "https://youtu.be/bbbbbbbbbbb" }),
  ).toBe("https://youtu.be/bbbbbbbbbbb");
});
