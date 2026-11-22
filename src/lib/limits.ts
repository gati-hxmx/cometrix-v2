function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** 未完了（queued・running）のジョブの上限。超えたら新しい動画の依頼は断る。 */
export const maxPendingJobs = () => intEnv("MAX_PENDING_JOBS", 50);
/** 同時に取得する本数（running）の上限。超えるぶんは queued のまま待つ。 */
export const maxConcurrentFetch = () => intEnv("MAX_CONCURRENT_FETCH", 2);
const rateMax = () => intEnv("RATE_LIMIT_MAX", 10);
const rateWindowMs = () => intEnv("RATE_LIMIT_WINDOW_SEC", 60) * 1000;

export const BUSY_MESSAGE = "混んでいます。少し待ってからもう一度お試しください。";

const hits = new Map<string, number[]>();

/** 接続元ごとの連打の制限（メモリ内の窓）。通してよければ ok、断るときは待つ秒数を返す。 */
export function checkRate(
  key: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const windowMs = rateWindowMs();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= rateMax()) {
    hits.set(key, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)),
    };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { ok: true };
}

export function resetRateLimits() {
  hits.clear();
}

/** 逆プロキシの背後にいる前提で、x-forwarded-for の先頭を接続元とする。 */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}
