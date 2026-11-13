export type FailureCode =
  | "invalid_url"
  | "no_chat"
  | "video_unavailable"
  | "fetch_blocked"
  | "fetch_failed";

export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  invalid_url:
    "URL が正しくありません。YouTube の配信アーカイブか、Twitch のアーカイブ（twitch.tv/videos/…）の URL を入れてください。",
  no_chat: "この動画にはチャットがありません（チャットのリプレイが無効か、コメントが0件です）。",
  video_unavailable:
    "動画を取得できません（非公開・削除・メンバー限定・サブスクライバー限定の可能性があります）。",
  fetch_blocked:
    "配信元（YouTube／Twitch）に取得を止められました。時間をおくか、別のネットワークで試してください。",
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
    /private video|video unavailable|video is unavailable|video is private|has been removed|members-only|join this channel|this video is not available|account associated with this video has been terminated/.test(
      s,
    )
  )
    return "video_unavailable";
  // 「チャットがない」とはっきり書かれたときだけ no_chat。live_chat の取得中の
  // 一時的な失敗（5xx・通信エラー）にも "live_chat" の字が出るので、それは fetch_failed にする。
  if (
    /there are no subtitles|no subtitles for the requested|live chat replay is (?:not available|disabled)|chat is disabled for this live stream/.test(
      s,
    )
  )
    return "no_chat";
  return "fetch_failed";
}
