import type { ChatMessage } from "../lib/buckets";
import { type Clip, isSafeClipUrl } from "../lib/clips";
import type { FetchProgress } from "../lib/progress";
import { JobFailure } from "./errors";
import type { ChatFetcher, FetchResume } from "./fetch-chat";

// Twitch には VOD のチャットを返す公式 API がないので、Twitch の Web が使う GraphQL を使う（旧版と同じ）。
// Client-ID は Web が使う公開の値で、秘密ではない。仕様が変わると動かなくなる可能性がある。
const GQL_URL = "https://gql.twitch.tv/gql";
const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const COMMENTS_HASH = "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";
const MAX_PAGES = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
// 全体の打ち切りは暴走の歯止めだけ。ページごとの打ち切り（REQUEST_TIMEOUT_MS）で止まった取得は見つける（#46）。
const TOTAL_TIMEOUT_MS = 3 * 60 * 60 * 1000;
/** 取得しながら保存するとき、この件数たまるごとに保存して続きの位置を残す（#47）。 */
export const SAVE_EVERY = 2000;

export type FetchLike = typeof fetch;

type CommentNode = {
  contentOffsetSeconds?: number;
  commenter?: { displayName?: string | null; login?: string | null } | null;
  message?: { fragments?: { text?: string | null }[] | null } | null;
};
type CommentsPage = {
  data?: {
    video?: {
      comments?: {
        edges?: { cursor?: string | null; node?: CommentNode | null }[] | null;
        pageInfo?: { hasNextPage?: boolean } | null;
      } | null;
    } | null;
  } | null;
  errors?: unknown[];
};

/** コメント1件を共通の形にする。表示名がなければログイン名。 */
export function toMessage(node: CommentNode): ChatMessage | null {
  if (typeof node.contentOffsetSeconds !== "number") return null;
  const author = node.commenter?.displayName || node.commenter?.login || "";
  const text = (node.message?.fragments ?? []).map((f) => f.text ?? "").join("");
  return { offsetMs: Math.round(node.contentOffsetSeconds * 1000), author, text };
}

/** GraphQL の1ページ分の応答から、コメントと次のカーソルを取り出す。 */
export function parseCommentsPage(page: CommentsPage): {
  messages: ChatMessage[];
  next: string | null;
  found: boolean;
} {
  const video = page.data?.video;
  if (!video) return { messages: [], next: null, found: false };
  const edges = video.comments?.edges ?? [];
  const messages: ChatMessage[] = [];
  for (const e of edges) {
    const m = e.node ? toMessage(e.node) : null;
    if (m) messages.push(m);
  }
  const last = edges[edges.length - 1]?.cursor ?? null;
  const next = video.comments?.pageInfo?.hasNextPage && last ? last : null;
  return { messages, next, found: true };
}

async function postJson(f: FetchLike, body: unknown, signal: AbortSignal): Promise<CommentsPage> {
  let res: Response;
  try {
    res = await f(GQL_URL, {
      method: "POST",
      headers: { "Client-ID": GQL_CLIENT_ID, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  } catch (e) {
    throw new JobFailure(
      "fetch_failed",
      (e as Error).name === "TimeoutError" ? "タイムアウトしました" : "Twitch に接続できません",
      true,
    );
  }
  if (res.status === 429 || res.status === 403) throw new JobFailure("fetch_blocked");
  if (!res.ok)
    throw new JobFailure("fetch_failed", `Twitch の応答エラー ${res.status}`, res.status >= 500);
  try {
    return (await res.json()) as CommentsPage;
  } catch {
    throw new JobFailure("fetch_failed", "Twitch の応答を読めません", true);
  }
}

/**
 * VOD のコメントを先頭から最後まで集める。
 * resume があるときは、その cursor の続きから取り、SAVE_EVERY 件ごとに resume.save で保存して空の配列を返す（#47）。
 * 保存はコメントと「次に取る位置」を一緒に渡すので、途中で失敗しても、保存済みの続きから取り直せる。
 */
export async function fetchTwitchComments(
  videoId: string,
  f: FetchLike = fetch,
  onPage?: (lastOffsetSec: number) => void,
  resume?: FetchResume,
): Promise<ChatMessage[]> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const all: ChatMessage[] = [];
  let cursor: string | null = resume?.cursor ?? null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const variables: Record<string, unknown> = cursor
      ? { videoID: videoId, cursor }
      : { videoID: videoId, contentOffsetSeconds: 0 };
    const page = await postJson(
      f,
      {
        operationName: "VideoCommentsByOffsetOrCursor",
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: COMMENTS_HASH } },
      },
      signal,
    );
    if (page.errors?.length && !page.data)
      throw new JobFailure("fetch_failed", "Twitch がエラーを返しました", true);
    const parsed = parseCommentsPage(page);
    if (!parsed.found) throw new JobFailure("video_unavailable");
    all.push(...parsed.messages);
    const last = parsed.messages[parsed.messages.length - 1];
    if (last) onPage?.(Math.floor(last.offsetMs / 1000));
    if (resume && (all.length >= SAVE_EVERY || !parsed.next)) {
      await resume.save(all.splice(0), parsed.next);
    }
    if (!parsed.next) return all;
    cursor = parsed.next;
  }
  throw new JobFailure("fetch_failed", "コメントが多すぎて最後まで取得できません");
}

const MAX_CLIP_PAGES = 5;

/** Helix の長さ（"1h2m3s"）を秒にする。読めなければ null。 */
export function parseTwitchDuration(text: unknown): number | null {
  if (typeof text !== "string" || !text) return null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** clips の1ページから、この VOD のクリップだけを取り出す。壊れた応答は空。 */
export function parseClips(body: unknown, videoId: string, lengthSec?: number): Clip[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: Clip[] = [];
  for (const c of data) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    if (String(r.video_id ?? "") !== videoId) continue;
    const off = r.vod_offset;
    if (typeof off !== "number" || !Number.isFinite(off) || off < 0) continue;
    if (lengthSec !== undefined && off > lengthSec) continue;
    if (typeof r.id !== "string" || !isSafeClipUrl(r.url)) continue;
    out.push({
      id: r.id,
      title: typeof r.title === "string" ? r.title : "",
      url: r.url,
      offsetSec: off,
      durationSec: typeof r.duration === "number" && r.duration > 0 ? Math.round(r.duration) : 0,
    });
  }
  return out;
}

type HelixVideo = { title?: string; user_id?: string; created_at?: string; duration?: string };

async function fetchClips(
  videoId: string,
  video: HelixVideo | undefined,
  headers: Record<string, string>,
  f: FetchLike,
): Promise<Clip[]> {
  const length = parseTwitchDuration(video?.duration);
  const start = Date.parse(video?.created_at ?? "");
  if (!video?.user_id || length === null || Number.isNaN(start)) return [];
  const params = new URLSearchParams({
    broadcaster_id: video.user_id,
    started_at: new Date(start).toISOString(),
    ended_at: new Date(start + (length + 60) * 1000).toISOString(),
    first: "100",
  });
  const seen = new Map<string, Clip>();
  for (let page = 0; page < MAX_CLIP_PAGES; page++) {
    const r = await f(`https://api.twitch.tv/helix/clips?${params}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!r.ok) break;
    const body = (await r.json()) as { pagination?: { cursor?: string } };
    for (const c of parseClips(body, videoId, length)) seen.set(c.id, c);
    const cursor = body.pagination?.cursor;
    if (!cursor) break;
    params.set("after", cursor);
  }
  return [...seen.values()].sort((a, b) => a.offsetSec - b.offsetSec);
}

export type TwitchInfo = { title: string | null; clips: Clip[] };

/** Helix API でタイトルを取る。設定がない・失敗したときは null。 */
export async function fetchTwitchTitle(
  videoId: string,
  env: Record<string, string | undefined> = process.env,
  f: FetchLike = fetch,
): Promise<string | null> {
  return (await fetchTwitchInfo(videoId, env, f)).title;
}

/**
 * Helix API でタイトルとクリップを取る。設定がない・失敗したときは空（分析は止めない）。
 * Secret は外に出さない。
 */
export async function fetchTwitchInfo(
  videoId: string,
  env: Record<string, string | undefined> = process.env,
  f: FetchLike = fetch,
): Promise<TwitchInfo> {
  const none: TwitchInfo = { title: null, clips: [] };
  const id = env.TWITCH_CLIENT_ID;
  const secret = env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return none;
  try {
    const t = await f("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!t.ok) return none;
    const { access_token } = (await t.json()) as { access_token?: string };
    if (!access_token) return none;
    const headers = { "Client-Id": id, Authorization: `Bearer ${access_token}` };
    const v = await f(`https://api.twitch.tv/helix/videos?id=${encodeURIComponent(videoId)}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!v.ok) return none;
    const video = ((await v.json()) as { data?: HelixVideo[] }).data?.[0];
    // クリップが取れなくてもタイトルは返す。
    const clips = await fetchClips(videoId, video, headers, f).catch(() => []);
    return { title: video?.title || null, clips };
  } catch {
    return none;
  }
}

/** VOD の長さ（秒）を GraphQL で取る。進み具合の分母にするだけなので、取れなければ null。 */
export async function fetchTwitchLength(
  videoId: string,
  f: FetchLike = fetch,
): Promise<number | null> {
  try {
    const res = await f(GQL_URL, {
      method: "POST",
      headers: { "Client-ID": GQL_CLIENT_ID, "content-type": "application/json" },
      body: JSON.stringify({
        query: "query($id: ID!) { video(id: $id) { lengthSeconds } }",
        variables: { id: videoId },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { video?: { lengthSeconds?: unknown } | null } };
    const n = body.data?.video?.lengthSeconds;
    return typeof n === "number" && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export const fetchWithTwitch: ChatFetcher = async (
  videoId,
  _url,
  _platform,
  onProgress,
  resume,
) => {
  // 長さは取得と並べて取り、分かった時点から ％ に使う。
  let durationSec: number | null = null;
  if (onProgress)
    void fetchTwitchLength(videoId).then((n) => {
      durationSec = n;
    });
  const report = (fetchedSec: number) =>
    onProgress?.({ stage: "fetching", fetchedSec, durationSec } satisfies FetchProgress);
  const [messages, info] = await Promise.all([
    fetchTwitchComments(videoId, fetch, report, resume),
    fetchTwitchInfo(videoId),
  ]);
  return {
    title: info.title ?? `Twitch VOD ${videoId}`,
    messages,
    clips: info.clips,
    saved: resume !== undefined,
  };
};
