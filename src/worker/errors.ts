export type FailureCode =
  | "invalid_url"
  | "no_chat"
  | "video_unavailable"
  | "fetch_blocked"
  | "fetch_failed";

export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  invalid_url: "URL が正しくありません。YouTube の動画の URL を入れてください。",
  no_chat: "この動画にはチャットがありません（チャットのリプレイが無効か、コメントが0件です）。",
  video_unavailable: "動画を取得できません（非公開・削除・メンバー限定の可能性があります）。",
  fetch_blocked: "YouTube に取得を止められました。時間をおくか、別のネットワークで試してください。",
  fetch_failed: "チャットの取得に失敗しました。",
};

export class JobFailure extends Error {
  constructor(
    public code: FailureCode,
    detail?: string,
  ) {
    super(detail ? `${FAILURE_MESSAGES[code]}（${detail}）` : FAILURE_MESSAGES[code]);
  }
}

/** yt-dlp の標準エラー出力から失敗の種類を決める。 */
export function classifyYtDlpError(stderr: string): FailureCode {
  const s = stderr.toLowerCase();
  if (/sign in to confirm|not a bot|http error 429|too many requests|http error 403/.test(s))
    return "fetch_blocked";
  if (
    /private video|video unavailable|has been removed|members-only|join this channel|this video is not available|account associated with this video has been terminated/.test(
      s,
    )
  )
    return "video_unavailable";
  if (/no subtitles|live_chat|live chat/.test(s)) return "no_chat";
  return "fetch_failed";
}
