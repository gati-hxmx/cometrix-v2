import { describe, expect, test } from "vitest";
import {
  chapterText,
  csvCell,
  csvHead,
  csvRow,
  exportFileName,
  markerXml,
  ytDlpCommand,
} from "../src/lib/export";

// 書き出し（#59）の各形式。

describe("CSV", () => {
  test("カンマ・引用符・改行はくくり、引用符は2つにする", () => {
    expect(csvCell("こんにちは")).toBe("こんにちは");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("1行目\n2行目")).toBe('"1行目\n2行目"');
    expect(csvCell(12)).toBe("12");
  });

  test("式として動く値は ' を前に付ける", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-w")).toBe("'-w");
    expect(csvCell("@user")).toBe("'@user");
    expect(csvCell("  =1+1")).toBe("'  =1+1");
  });

  test("行は 時刻,秒,投稿者,コメント で、1時間以上は h:mm:ss。先頭は BOM 付きの見出し", () => {
    expect(csvHead()).toBe("\uFEFF時刻,秒,投稿者,コメント\r\n");
    expect(csvRow({ offsetMs: 3_723_900, author: "taro", body: "草" })).toBe(
      "1:02:03,3723,taro,草\r\n",
    );
    expect(csvRow({ offsetMs: 65_000, author: "a", body: "x" })).toBe("1:05,65,a,x\r\n");
  });
});

describe("チャプター文", () => {
  test("0:00 から始め、時刻順に並べ、1時間以上は h:mm:ss", () => {
    const text = chapterText([
      { startSec: 3723, count: 50 },
      { startSec: 600, count: 1200 },
    ]);
    expect(text).toBe("0:00 はじめ\n10:00 盛り上がり（1,200 件）\n1:02:03 盛り上がり（50 件）");
  });

  test("10秒未満の間は詰め、3つに満たなければ出さない（YouTube の決まり）", () => {
    expect(
      chapterText([
        { startSec: 5, count: 9 },
        { startSec: 600, count: 9 },
      ]),
    ).toBeNull();
    expect(chapterText([])).toBeNull();
  });

  test("人数のグラフでは単位を「人」にする", () => {
    expect(
      chapterText(
        [
          { startSec: 60, count: 3 },
          { startSec: 120, count: 4 },
        ],
        { unit: "人" },
      ),
    ).toContain("1:00 盛り上がり（3 人）");
  });

  test("動画の終わりまで10秒ない山は入れない（最後のチャプターも10秒以上）", () => {
    const entries = [
      { startSec: 60, count: 3 },
      { startSec: 120, count: 4 },
      { startSec: 595, count: 9 },
    ];
    expect(chapterText(entries, { durationSec: 600 })).toBe(
      "0:00 はじめ\n1:00 盛り上がり（3 件）\n2:00 盛り上がり（4 件）",
    );
    expect(chapterText(entries.slice(1), { durationSec: 600 })).toBeNull();
  });
});

describe("yt-dlp のコマンド", () => {
  const url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
  test("範囲ごとに --download-sections を時刻順で並べる", () => {
    expect(
      ytDlpCommand(url, [
        { start: 3723, end: 3753 },
        { start: 65, end: 95 },
      ]),
    ).toBe(
      `yt-dlp --download-sections "*1:05-1:35" --download-sections "*1:02:03-1:02:33" -o "%(title)s_%(section_start)s.%(ext)s" "${url}"`,
    );
  });

  test("範囲がない・URL に変な文字があるときは出さない", () => {
    expect(ytDlpCommand(url, [])).toBeNull();
    expect(ytDlpCommand('https://x/"; rm -rf ~', [{ start: 0, end: 1 }])).toBeNull();
    expect(ytDlpCommand("https://x/$(id)", [{ start: 0, end: 1 }])).toBeNull();
  });
});

describe("編集ソフト用の XML", () => {
  test("範囲をフレームのマーカーにし、名前の記号はエスケープする", () => {
    const out = markerXml('配信 <&> "テスト"', 7200, [
      { name: "神回 & 草", start: 3723, end: 3753 },
      { name: "", start: 10, end: 20 },
    ]);
    expect(out).toContain("<name>配信 &lt;&amp;&gt; &quot;テスト&quot;</name>");
    expect(out).toContain("<duration>216000</duration>");
    expect(out.indexOf("範囲1")).toBeLessThan(out.indexOf("神回 &amp; 草"));
    expect(out).toContain("<in>111690</in>");
    expect(out).toContain("<out>112590</out>");
    expect(out).toContain("<comment>1:02:03〜1:02:33</comment>");
    expect(out).not.toContain("神回 & 草");
  });

  test("XML で使えない制御文字は消す", () => {
    expect(markerXml("a\u0001b", 10, [])).toContain("<name>ab</name>");
  });
});

test("ファイル名に使えない文字は _ にする", () => {
  expect(exportFileName('a/b:c*?"<>|', "csv")).toBe("a_b_c______.csv");
  expect(exportFileName("", "xml")).toBe("cometrix.xml");
});
