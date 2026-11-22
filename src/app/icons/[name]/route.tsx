import { ImageResponse } from "next/og";
import { APP_COLORS } from "../../../lib/app-colors";

// ホーム画面のアイコン（#70）。線のアイコン（Lucide の chart-column）を、--accent-weak の角丸の四角に --accent で描く。
// public/ に置くとコンテナ（Dockerfile）に入らないので、ビルドのときに PNG を作る。
const ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  // maskable は端末が丸や四角に切り抜くので、地を全面にし、絵を内側の 50% に収める
  "maskable-512.png": { size: 512, maskable: true },
  "apple-touch-icon.png": { size: 180, maskable: true },
} as const;

type Name = keyof typeof ICONS;

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = ICONS[name as Name];
  if (!icon) return new Response("not found", { status: 404 });
  const { size, maskable } = icon;
  const art = size * (maskable ? 0.5 : 0.64);
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: APP_COLORS.light.accentWeak,
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      <svg
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
