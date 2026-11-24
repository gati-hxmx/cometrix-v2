import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { classifyReaction, REACTION_KINDS, type ReactionBucket } from "../src/lib/reactions";
import { REACTION_SAMPLES } from "./fixtures/reaction-samples";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("反応の種類の集計 API（Postgres、#62）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/reactions/route").GET;
  const get = (id: string, qs = "") =>
    GET(new Request(`http://x/?${qs}`), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET } = await import("../src/app/api/jobs/[id]/reactions/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  async function seedJob(
    rows: { offsetMs: number; author: string; body: string }[],
    last: number,
    status: "done" | "running" = "done",
    videoId = "aaaaaaaaaaa",
  ) {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId, status })
      .returning({ id: jobs.id });
    if (rows.length)
      await db.insert(chatMessages).values(rows.map((r) => ({ ...r, jobId: job.id })));
    const b = [];
    for (let s = 0; s <= last; s += 30) b.push({ jobId: job.id, startSec: s, count: 0 });
    await db.insert(chatBuckets).values(b);
    return job.id;
  }

  test("DB の判定は classifyReaction と同じ（見本を1区間ずつに置く）", async () => {
    const id = await seedJob(
      REACTION_SAMPLES.map(([body], i) => ({ offsetMs: i * 30000, author: "a", body })),
      (REACTION_SAMPLES.length - 1) * 30,
    );
    const res = (await (await get(id)).json()) as ReactionBucket[];
    expect(res).toHaveLength(REACTION_SAMPLES.length);
    res.forEach((b, i) => {
      const kind = REACTION_KINDS.find((k) => b[k] === 1);
      expect([REACTION_SAMPLES[i][0], kind]).toEqual([
        REACTION_SAMPLES[i][0],
        classifyReaction(REACTION_SAMPLES[i][0]),
      ]);
    });
  });

  test("同じ区間をまとめ、動画開始前は除き、長さは絞り込まない集計にそろえる。絞り込みも効く", async () => {
    const id = await seedJob(
      [
        { offsetMs: -1000, author: "a", body: "草" },
        { offsetMs: 1000, author: "taro", body: "草" },
        { offsetMs: 2000, author: "jiro", body: "8888" },
        { offsetMs: 3000, author: "taro", body: "こんにちは" },
        { offsetMs: 31000, author: "taro", body: "神" },
      ],
      90,
    );
    const res = (await (await get(id)).json()) as ReactionBucket[];
    expect(res.map((b) => b.startSec)).toEqual([0, 30, 60, 90]);
    expect(res[0]).toMatchObject({ laugh: 1, clap: 1, other: 1 });
    expect(res[1]).toMatchObject({ god: 1 });
    const taro = (await (await get(id, "user=taro")).json()) as ReactionBucket[];
    expect(taro[0]).toMatchObject({ laugh: 1, clap: 0, other: 1 });
  });

  test("スパムを除いて数える", async () => {
    const id = await seedJob(
      [
        { offsetMs: 1000, author: "a", body: "草" },
        { offsetMs: 2000, author: "a", body: "草" },
        { offsetMs: 3000, author: "a", body: "草" },
      ],
      0,
    );
    const all = (await (await get(id)).json()) as ReactionBucket[];
    const free = (await (await get(id, "spam=1")).json()) as ReactionBucket[];
    expect(all[0].laugh).toBe(3);
    expect(free[0].laugh).toBeLessThan(3);
  });

  test("ない分析は 404、終わっていない分析は 409、まちがった値は 400", async () => {
    expect((await get("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await get("x")).status).toBe(404);
    const running = await seedJob([], 0, "running");
    expect((await get(running)).status).toBe(409);
    const id = await seedJob([], 0, "done", "bbbbbbbbbbb");
    expect((await get(id, "spam=2")).status).toBe(400);
  });
});
