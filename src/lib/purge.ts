import { sql } from "drizzle-orm";
import type { connect } from "../db/client";

type Db = ReturnType<typeof connect>["db"];

export const DEFAULT_PURGE_DAYS = 90;

/** 掃除までの日数を環境変数から読む。未設定は既定値。1未満・整数でない値は null（掃除しない）。 */
export function parsePurgeDays(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PURGE_DAYS;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * done のまま days 日を超えて開かれていない分析のコメント本文（chat_messages）を消す。
 * jobs・chat_buckets・result は残す。1ジョブごとのトランザクションで、失敗しても他は続ける。
 * 消したジョブ数を返す。
 */
export async function purgeStale(db: Db, opts: { days: number }): Promise<number> {
  const { days } = opts;
  if (!Number.isSafeInteger(days) || days < 1) throw new Error(`days が不正です: ${days}`);
  const targets = (await db.execute(sql`
    select id from jobs
    where status = 'done' and messages_purged_at is null
      and coalesce(last_opened_at, created_at) < now() - make_interval(days => ${days})`)) as {
    id: string;
  }[];
  let purged = 0;
  for (const { id } of targets) {
    try {
      await db.transaction(async (tx) => {
        // 掃除の直前に開かれていないか、行ロックを取って確かめ直す。
        const locked = await tx.execute(sql`
          select id from jobs
          where id = ${id} and status = 'done' and messages_purged_at is null
            and coalesce(last_opened_at, created_at) < now() - make_interval(days => ${days})
          for update`);
        if (locked.length === 0) return;
        await tx.execute(sql`delete from chat_messages where job_id = ${id}`);
        await tx.execute(sql`update jobs set messages_purged_at = now() where id = ${id}`);
        purged += 1;
      });
    } catch (e) {
      console.error("purge failed", id, e);
    }
  }
  return purged;
}
