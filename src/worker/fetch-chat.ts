import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ChatMessage } from "../lib/buckets";
import { parseLiveChat } from "./chat-parse";
import { classifyYtDlpError, JobFailure } from "./errors";

const execFileAsync = promisify(execFile);

export type FetchedChat = { title: string; messages: ChatMessage[] };
/** 取得の差し替え口。テストでは保存済みのサンプルを返す関数を渡す。 */
export type ChatFetcher = (videoId: string, url: string) => Promise<FetchedChat>;

const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * yt-dlp に渡す引数。`--print` は既定で `--simulate` を伴い字幕ファイルを書かないので、
 * `--no-simulate` で書かせる（動画本体は `--skip-download` で落とさない）。
 */
export function ytDlpArgs(url: string, outBase: string): string[] {
  return [
    "--skip-download",
    "--no-simulate",
    // YouTube の JavaScript の確認を解くのに JS の実行環境が要る。イメージには Node があるので有効にする（Deno は既定で有効、Node は指定が要る）。
    "--js-runtimes",
    "node",
    "--write-subs",
    "--sub-langs",
    "live_chat",
    "--no-playlist",
    "--print",
    "title",
    "-o",
    outBase,
    "--",
    url,
  ];
}

/** yt-dlp でライブチャットのリプレイを取得する。URL は呼び出し側で検証・正規化済みであること。 */
export const fetchWithYtDlp: ChatFetcher = async (_videoId, url) => {
  const dir = await mkdtemp(join(tmpdir(), "chat-"));
  try {
    let stdout = "";
    try {
      const res = await execFileAsync(
        process.env.YT_DLP_PATH ?? "yt-dlp",
        ytDlpArgs(url, join(dir, "chat")),
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );
      stdout = res.stdout;
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
      if (err.code === "ENOENT") throw new JobFailure("fetch_failed", "yt-dlp が見つかりません");
      if (err.killed) throw new JobFailure("fetch_failed", "タイムアウトしました");
      const stderr = String(err.stderr ?? "");
      throw new JobFailure(
        classifyYtDlpError(stderr),
        stderr.trim().split("\n").pop()?.slice(0, 300),
      );
    }
    let raw: string;
    try {
      raw = await readFile(join(dir, "chat.live_chat.json"), "utf8");
    } catch {
      throw new JobFailure("no_chat");
    }
    return { title: stdout.trim().split("\n")[0] ?? "", messages: parseLiveChat(raw) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
