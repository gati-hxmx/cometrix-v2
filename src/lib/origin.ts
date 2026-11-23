// サーバーで、外から見た URL の始まり（https://example.com）を決める（#68 の SNS の絵の URL）。
// APP_ORIGIN があればそれを使う。無ければリクエストの Host と X-Forwarded-Proto（nginx の後ろ）から作る。

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function requestOrigin(
  h: Headers,
  env: string | undefined = process.env.APP_ORIGIN,
): string {
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      // 読めない値は使わず、下でリクエストから作る
    }
  }
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  if (!HOST.test(host)) return "http://localhost:3000";
  const local = /^(localhost|127\.|\[?::1)/.test(host);
  return `${proto === "http" || proto === "https" ? proto : local ? "http" : "https"}://${host}`;
}
