import { ImageResponse } from "next/og";
import { getDb } from "../../../db/client";
import { APP_COLORS } from "../../../lib/app-colors";
import { loadOgpFont, ogpBars, ogpTitle } from "../../../lib/share-ogp";
import { loadShared } from "../../../lib/share-page";

// 共有リンクを SNS に貼ったときの絵（#68）：タイトルとコメント数のグラフ。色はライトの配色。
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "配信のコメント数のグラフ";

const C = APP_COLORS.light;

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadShared(getDb(), token);
  const title = ogpTitle(shared?.title ?? "");
  const count = shared ? `コメント ${shared.totalComments.toLocaleString("ja-JP")} 件` : "";
  const bars = ogpBars(shared?.buckets ?? []);
  const font = await loadOgpFont(`${title}${count}Cometrix配信の盛り上がり0123456789,`);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "56px 64px",
        background: C.surface,
        color: C.text,
        // 字が取れないときは fontFamily を書かない（undefined を渡すと描けない）
        ...(font ? { fontFamily: "Noto Sans JP" } : {}),
      }}
    >
      {font && (
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.3,
            maxHeight: 136,
            overflow: "hidden",
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          flex: 1,
          marginTop: 32,
          borderBottom: `2px solid ${C.line}`,
        }}
      >
        {bars.map((b, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 棒は順番が固定
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(b.h * 100, 1)}%`,
              background: b.peak ? C.accent : C.chart1,
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
          fontSize: 28,
          color: C.muted,
        }}
      >
        <span>{font ? count : ""}</span>
        <span style={{ color: C.accent, fontWeight: 700 }}>Cometrix</span>
      </div>
    </div>,
    // 字が取れないときは fonts を渡さない（空の配列だと標準の字も使えなくなる）
    font ? { ...size, fonts: [{ name: "Noto Sans JP", data: font, weight: 700 }] } : size,
  );
}
