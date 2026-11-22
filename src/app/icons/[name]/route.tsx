import { ImageResponse } from "next/og";
import { APP_COLORS } from "../../../lib/app-colors";

// ホーム画面のアイコン（#70）。線のアイコン（Lucide の chart-column）を、--accent-weak の角丸の四角に --accent で描く。
// public/ に置くとコンテナ（Dockerfile）に入らないので、ビルドのときに PNG を作る。
const ICONS = {
  "icon-192.png": { size: 192, bleed: false, art: 0.64 },
  "icon-512.png": { size: 512, bleed: false, art: 0.64 },
  // maskable は端末が丸や四角に切り抜くので、地を全面にし、絵を内側の 50% に収める
  "maskable-512.png": { size: 512, bleed: true, art: 0.5 },
  // iOS は角を丸めるだけで切り抜かないので、地は全面・絵は通常と同じ大きさ
  "apple-touch-icon.png": { size: 180, bleed: true, art: 0.64 },
} as const;

type Name = keyof typeof ICONS;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = ICONS[name as Name];
  if (!icon) return new Response("not found", { status: 404 });
  const { size, bleed } = icon;
  const art = size * icon.art;
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: APP_COLORS.light.accentWeak,
        borderRadius: bleed ? 0 : size * 0.22,
      }}
    >
      <svg
        aria-hidden
        width={art}
        height={art}
        viewBox="0 0 24 24"
        fill="none"
        stroke={APP_COLORS.light.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
