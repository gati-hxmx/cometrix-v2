import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "../lib/buckets";
import { type FetchProgress, lastOffsetSec, parseDuration } from "../lib/progress";
import { parseLiveChat } from "./chat-parse";
import { classifyYtDlpError, JobFailure } from "./errors";

export type FetchedChat = { title: string; messages: ChatMessage[] };
/** 取得の差し替え口。テストでは保存済みのサンプルを返す関数を渡す。 */
export type ChatFetcher = (
  videoId: string,
  url: string,
  platform: "youtube" | "twitch",
  onProgress?: (p: FetchProgress) => void,
) => Promise<FetchedChat>;

const TIMEOUT_MS = 10 * 60 * 1000;
const PROGRESS_MS = 3000;
const TAIL_BYTES = 64 * 1024;

/** 書きかけのファイルの末尾を読む。まだない・読めないときは空文字。 */
async function readTail(path: string): Promise<string> {
  try {
    const f = await open(path, "r");
    try {
      const { size } = await f.stat();
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      await f.read(buf, 0, len, size - len);
      return buf.toString("utf8");
    } finally {
      await f.close();
    }
  } catch {
    return "";
  }
}

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
    // 配信の長さ（秒）。取得の前に出るので、進み具合の分母にする（#43）。
    "--print",
    "duration",
    "-o",
    outBase,
    "--",
    url,
  ];
}

/** yt-dlp でライブチャットのリプレイを取得する。URL は呼び出し側で検証・正規化済みであること。 */
export const fetchWithYtDlp: ChatFetcher = async (_videoId, url, _platform, onProgress) => {
  const dir = await mkdtemp(join(tmpdir(), "chat-"));
  const out = join(dir, "chat.live_chat.json");
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    let stdout = "";
    try {
      stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          process.env.YT_DLP_PATH ?? "yt-dlp",
          ytDlpArgs(url, join(dir, "chat")),
          { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
          (err, so, se) => (err ? reject(Object.assign(err, { stderr: se })) : resolve(so)),
        );
        if (!onProgress) return;
        // 標準出力の2行目が配信の長さ。取得中は書きかけのファイルの末尾から最後のコメントの時刻を読む。
        let printed = "";
        let durationSec: number | null = null;
        child.stdout?.on("data", (d) => {
          printed += String(d);
          durationSec = parseDuration(printed.split("\n")[1]);
        });
        timer = setInterval(async () => {
          const sec = lastOffsetSec(await readTail(`${out}.part`));
          if (sec !== null) onProgress({ stage: "fetching", fetchedSec: sec, durationSec });
        }, PROGRESS_MS);
      });
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
      if (err.code === "ENOENT") throw new JobFailure("fetch_failed", "yt-dlp が見つかりません");
      if (err.killed) throw new JobFailure("fetch_failed", "タイムアウトしました");
      const stderr = String(err.stderr ?? "");
      throw new JobFailure(
        classifyYtDlpError(stderr),
        stderr.trim().split("\n").pop()?.slice(0, 300),
      );
    } finally {
      clearInterval(timer);
    }
    let raw: string;
    try {
      raw = await readFile(out, "utf8");
    } catch {
      throw new JobFailure("no_chat");
    }
    return { title: stdout.trim().split("\n")[0] ?? "", messages: parseLiveChat(raw) };
  } finally {
    clearInterval(timer);
    await rm(dir, { recursive: true, force: true });
  }
};
