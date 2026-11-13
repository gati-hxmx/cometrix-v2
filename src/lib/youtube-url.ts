export type Platform = "youtube" | "twitch";

export type ParsedUrl =
  | { ok: true; platform: Platform; videoId: string; url: string }
  | { ok: false; code: "invalid_url" };

const ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_ID = /^[0-9]{1,15}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

/** YouTube／Twitch（アーカイブ）の URL から動画 ID を取り出し、正規化した URL を返す。 */
export function parseVideoUrl(input: string): ParsedUrl {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, code: "invalid_url" };
  const host = u.hostname.toLowerCase();

  if (TWITCH_HOSTS.has(host)) {
    const [, first, id] = u.pathname.split("/");
    if (first !== "videos" || !id || !TWITCH_ID.test(id)) return { ok: false, code: "invalid_url" };
    return {
      ok: true,
      platform: "twitch",
      videoId: id,
      url: `https://www.twitch.tv/videos/${id}`,
    };
  }

  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (YT_HOSTS.has(host)) {
    const [, first, second] = u.pathname.split("/");
    if (first === "watch") id = u.searchParams.get("v");
    else if (first === "live" || first === "embed" || first === "shorts") id = second ?? null;
  }
  if (!id || !ID.test(id)) return { ok: false, code: "invalid_url" };
  return {
    ok: true,
    platform: "youtube",
    videoId: id,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}
