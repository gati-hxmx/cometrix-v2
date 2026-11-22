import type { MetadataRoute } from "next";
import { APP_COLORS } from "../lib/app-colors";

// スマホのホーム画面に置けるようにする（#70）。色は配色の変数（globals.css のライト）と同じ値。
// 共有の受け先：YouTube・Twitch の「共有」から URL を受け取り、トップの入力欄に入れる（src/lib/share.ts）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cometrix",
    short_name: "Cometrix",
    description: "配信アーカイブのコメントから、盛り上がった場面を見つける",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_COLORS.light.bg,
    theme_color: APP_COLORS.light.surface, // ヘッダーの地
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
