import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "../lib/buckets";
import type { Clip } from "../lib/clips";
import { type FetchProgress, lastOffsetSec, parseDuration } from "../lib/progress";
import { parseLiveChat } from "./chat-parse";
import { classifyYtDlpError, JobFailure } from "./errors";

/**
 * 取得の結果。saved が true のときは、コメントを取得中に FetchResume.save で保存済みで、messages は空。
 */
export type FetchedChat = {
  title: string;
  messages: ChatMessage[];
  clips?: Clip[];
  saved?: boolean;
};

/**
 * 途中から取り直すための口（#47）。続きの位置を持てる取得（Twitch）だけが使う。
 * cursor は前の試行で保存したところの続き（最初からなら null）。
 * save は取ったコメントと「次に取る位置」を一緒に保存する（最後まで取ったら cursor は null）。
 */
export type FetchResume = {
  cursor: string | null;
  save: (messages: ChatMessage[], cursor: string | null) => Promise<void>;
};

/** 取得の差し替え口。テストでは保存済みのサンプルを返す関数を渡す。 */
export type ChatFetcher = (
  videoId: string,
  url: string,
  platform: "youtube" | "twitch",
  onProgress?: (p: FetchProgress) => void,
  resume?: FetchResume,
) => Promise<FetchedChat>;

/** これだけ書きかけのファイルも標準出力も増えなければ、止まったとみなして打ち切る（#46）。 */
export const STALL_MS = 5 * 60 * 1000;
/** 進み続けていても、これを超えたら打ち切る（暴走の歯止め）。 */
export const HARD_LIMIT_MS = 3 * 60 * 60 * 1000;
const PROGRESS_MS = 3000;
const NOT_STARTED = /live event will begin|premieres in/i;
const TAIL_BYTES = 64 * 1024;

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

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

export type YtDlpOptions = {
  bin?: string;
  stallMs?: number;
  hardLimitMs?: number;
  pollMs?: number;
};

/**
 * yt-dlp でライブチャットのリプレイを取得する。URL は呼び出し側で検証・正規化済みであること。
 *
 * 打ち切りは「進まなくなったとき」だけ（#46）。書きかけのファイルか標準出力が stallMs のあいだ増えなければ止め、
 * 再試行できる失敗にする。yt-dlp はライブチャットの続きから取れない（書きかけのファイルに先頭から足してしまう）ので、
 * 試行ごとに新しい作業フォルダで最初から取る（#47）。
 */
export function makeYtDlpFetcher(opts: YtDlpOptions = {}): ChatFetcher {
  const stallMs = opts.stallMs ?? STALL_MS;
  const hardLimitMs = opts.hardLimitMs ?? HARD_LIMIT_MS;
  const pollMs = opts.pollMs ?? PROGRESS_MS;
  return async (_videoId, url, _platform, onProgress) => {
    const dir = await mkdtemp(join(tmpdir(), "chat-"));
    const out = join(dir, "chat.live_chat.json");
    let timer: ReturnType<typeof setInterval> | undefined;
    let stalled = false;
    try {
      let stdout = "";
      try {
        stdout = await new Promise<string>((resolve, reject) => {
          const child = execFile(
            opts.bin ?? process.env.YT_DLP_PATH ?? "yt-dlp",
            ytDlpArgs(url, join(dir, "chat")),
            { timeout: hardLimitMs, maxBuffer: 10 * 1024 * 1024 },
            (err, so, se) => (err ? reject(Object.assign(err, { stderr: se })) : resolve(so)),
          );
          // 標準出力の2行目が配信の長さ。取得中は書きかけのファイルの末尾から最後のコメントの時刻を読む。
          let printed = "";
          let durationSec: number | null = null;
          child.stdout?.on("data", (d) => {
            printed += String(d);
            // 2行目が改行まで届いてから読む（途中で切れた数を長さにしない）。
            const lines = printed.split("\n");
            if (lines.length > 2) durationSec = parseDuration(lines[1]);
          });
          let seen = -1;
          let lastGrow = Date.now();
          let polling = false;
          timer = setInterval(async () => {
            if (polling) return;
            polling = true;
            try {
              const running = () => child.exitCode === null && child.signalCode === null;
              const size = (await sizeOf(`${out}.part`)) + (await sizeOf(out)) + printed.length;
              if (size !== seen) {
                seen = size;
                lastGrow = Date.now();
              } else if (running() && Date.now() - lastGrow >= stallMs) {
                stalled = true;
                child.kill("SIGTERM");
                return;
              }
              if (!onProgress) return;
              const sec = lastOffsetSec(await readTail(`${out}.part`));
              // 読んでいるあいだに取得が終わっていたら知らせない（保存中の表示を戻さない）。
              if (sec !== null && running())
                onProgress({ stage: "fetching", fetchedSec: sec, durationSec });
            } finally {
              polling = false;
            }
          }, pollMs);
        });
      } catch (e) {
        const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
        if (err.code === "ENOENT") throw new JobFailure("fetch_failed", "yt-dlp が見つかりません");
        if (stalled)
          throw new JobFailure(
            "fetch_failed",
            `${Math.round(stallMs / 60000)}分のあいだ取得が進まなかったため止めました`,
            true,
          );
        if (err.killed) throw new JobFailure("fetch_failed", "時間がかかりすぎたため止めました");
        const stderr = String(err.stderr ?? "");
        const code = classifyYtDlpError(stderr);
        // 理由の分からない失敗（通信の途切れ・5xx など）は、もう一度取れば通ることがある。
        // まだ始まっていない配信の枠は、すぐ取り直しても同じなので再試行しない（docs/test-failures.md）。
        throw new JobFailure(
          code,
          stderr.trim().split("\n").pop()?.slice(0, 300),
          code === "fetch_failed" && !NOT_STARTED.test(stderr),
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
}

export const fetchWithYtDlp: ChatFetcher = makeYtDlpFetcher();
