// 長い配信（10時間・10万コメント）の計測（#47）。scripts/bench から動かす。
// 仮データは bench 専用のジョブとして作り、終わったら消す（普段のデータには触らない）。
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { GET as getBuckets } from "../src/app/api/jobs/[id]/buckets/route";
import { GET as getMessages } from "../src/app/api/jobs/[id]/messages/route";
import { connect } from "../src/db/client";
import { jobs } from "../src/db/schema";
import type { ChatMessage } from "../src/lib/buckets";
import { runJob } from "../src/worker/process";

const COMMENTS = Number(process.env.BENCH_COMMENTS ?? 100_000);
const HOURS = 10;
const RUNS = 5;

/** 同じ種なら毎回同じ列を返す乱数（mulberry32）。 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 10時間に散らばり、ところどころに山がある、笑い・連投を含むコメント。 */
export function benchMessages(n = COMMENTS, seed = 47): ChatMessage[] {
  const r = rng(seed);
  const lengthMs = HOURS * 3600 * 1000;
  const peaks = Array.from({ length: 40 }, () => r() * lengthMs);
  const words = ["w", "www", "草", "笑", "かわいい", "8888", "うまい", "初見です", "なるほど", "？"];
  const out: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    const nearPeak = r() < 0.35;
    const at = nearPeak
      ? peaks[Math.floor(r() * peaks.length)] + (r() - 0.5) * 60_000
      : r() * lengthMs;
    out.push({
      offsetMs: Math.max(0, Math.min(lengthMs, Math.round(at))),
      author: `viewer${Math.floor(r() ** 2 * 5000)}`,
      text: `${words[Math.floor(r() * words.length)]}${r() < 0.2 ? " その場面すき" : ""}`,
    });
  }
  return out.sort((a, b) => a.offsetMs - b.offsetMs);
}

async function time(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** 手元・compose の DB だけで動かす（本番の DB にマイグレーションと仮データを入れないため）。 */
function assertLocal(url = process.env.DATABASE_URL ?? "") {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "db"].includes(host) && process.env.BENCH_ALLOW_REMOTE !== "1")
    throw new Error(`手元の DB ではありません（${host}）。BENCH_ALLOW_REMOTE=1 で強制できます`);
}

async function main() {
  assertLocal();
  const { sql, db } = connect();
  await migrate(db, { migrationsFolder: "./drizzle" });
  const videoId = `bench${randomBytes(3).toString("hex")}`;
  // ワーカーに拾われないよう、running（試行1回目）として作り、自分で処理する。
  const [job] = await db
    .insert(jobs)
    .values({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      status: "running",
      attempts: 1,
    })
    .returning();
  const rows: { name: string; ms: number; target: number }[] = [];
  try {
    const messages = benchMessages();
    const claimed = { id: job.id, url: job.url, attempts: 1, result: null };
    const saveMs = await time(() => runJob(db, claimed, async () => ({ title: "bench", messages })));
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    if (done.status !== "done") throw new Error(`保存に失敗しました: ${JSON.stringify(done.error)}`);
    rows.push({ name: `${COMMENTS.toLocaleString()}件の保存と集計`, ms: saveMs, target: 10_000 });

    const ctx = { params: Promise.resolve({ id: job.id }) };
    const base = `http://bench/api/jobs/${job.id}`;
    const api: [string, () => Promise<Response>, number][] = [
      ["グラフの集計（絞り込みなし）", () => getBuckets(new Request(`${base}/buckets`), ctx), 300],
      ["グラフの集計（笑い）", () => getBuckets(new Request(`${base}/buckets?laugh=1`), ctx), 300],
      ["グラフの集計（スパム除外）", () => getBuckets(new Request(`${base}/buckets?spam=1`), ctx), 300],
      ["グラフの集計（言葉の線）", () => getBuckets(new Request(`${base}/buckets?term=草`), ctx), 300],
      ["チャット一覧（絞り込みなし）", () => getMessages(new Request(`${base}/messages?aroundSec=18000`), ctx), 200],
      [
        "チャット一覧（言葉で絞り込み）",
        () => getMessages(new Request(`${base}/messages?aroundSec=18000&q=${encodeURIComponent("すき")}`), ctx),
        500,
      ],
      [
        "チャット一覧（めったにない言葉）",
        () => getMessages(new Request(`${base}/messages?aroundSec=18000&q=zzzz`), ctx),
        500,
      ],
    ];
    for (const [name, call, target] of api) {
      const res = await call();
      if (!res.ok) throw new Error(`${name} が ${res.status} を返しました`);
      const times: number[] = [];
      for (let i = 0; i < RUNS; i++)
        times.push(
          await time(async () => {
            await (await call()).json();
          }),
        );
      rows.push({ name: `${name}（${RUNS}回の中央値）`, ms: median(times), target });
    }
  } finally {
    await db.delete(jobs).where(eq(jobs.id, job.id));
    await sql.end();
  }
  console.log("| 項目 | 測った時間 | 目安 | 判定 |");
  console.log("| --- | --- | --- | --- |");
  for (const r of rows)
    console.log(
      `| ${r.name} | ${Math.round(r.ms).toLocaleString()} ms | ${r.target.toLocaleString()} ms 以内 | ${r.ms <= r.target ? "OK" : "超えた"} |`,
    );
  if (rows.some((r) => r.ms > r.target)) process.exitCode = 1;
}

await main();
// API が使う共有の接続（getDb）は閉じる口がないので、表を出したら終える。
process.exit(process.exitCode ?? 0);
