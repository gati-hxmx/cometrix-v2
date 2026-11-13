import type { ChatMessage } from "../lib/buckets";
import { JobFailure } from "./errors";
import type { ChatFetcher } from "./fetch-chat";

// Twitch には VOD のチャットを返す公式 API がないので、Twitch の Web が使う GraphQL を使う（旧版と同じ）。
// Client-ID は Web が使う公開の値で、秘密ではない。仕様が変わると動かなくなる可能性がある。
const GQL_URL = "https://gql.twitch.tv/gql";
const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const COMMENTS_HASH = "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";
const MAX_PAGES = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000;

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
    );
  }
  if (res.status === 429 || res.status === 403) throw new JobFailure("fetch_blocked");
  if (!res.ok) throw new JobFailure("fetch_failed", `Twitch の応答エラー ${res.status}`);
  try {
    return (await res.json()) as CommentsPage;
  } catch {
    throw new JobFailure("fetch_failed", "Twitch の応答を読めません");
  }
}

/** VOD のコメントを先頭から最後まで集める。 */
export async function fetchTwitchComments(
  videoId: string,
  f: FetchLike = fetch,
): Promise<ChatMessage[]> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const all: ChatMessage[] = [];
  let cursor: string | null = null;
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
      throw new JobFailure("fetch_failed", "Twitch がエラーを返しました");
    const parsed = parseCommentsPage(page);
    if (!parsed.found) throw new JobFailure("video_unavailable");
    all.push(...parsed.messages);
    if (!parsed.next) return all;
    cursor = parsed.next;
  }
  throw new JobFailure("fetch_failed", "コメントが多すぎて最後まで取得できません");
}

/** Helix API でタイトルを取る。設定がない・失敗したときは null（分析は止めない）。Secret は外に出さない。 */
export async function fetchTwitchTitle(
  videoId: string,
  env: Record<string, string | undefined> = process.env,
  f: FetchLike = fetch,
): Promise<string | null> {
  const id = env.TWITCH_CLIENT_ID;
  const secret = env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
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
    if (!t.ok) return null;
    const { access_token } = (await t.json()) as { access_token?: string };
    if (!access_token) return null;
    const v = await f(`https://api.twitch.tv/helix/videos?id=${encodeURIComponent(videoId)}`, {
      headers: { "Client-Id": id, Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!v.ok) return null;
    const body = (await v.json()) as { data?: { title?: string }[] };
    return body.data?.[0]?.title || null;
  } catch {
    return null;
  }
}

export const fetchWithTwitch: ChatFetcher = async (videoId) => {
  const [messages, title] = await Promise.all([
    fetchTwitchComments(videoId),
    fetchTwitchTitle(videoId),
  ]);
  return { title: title ?? `Twitch VOD ${videoId}`, messages };
};
