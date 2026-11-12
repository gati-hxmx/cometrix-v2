import { sql as dsql } from "drizzle-orm";
import { connect } from "../db/client";
import { pickInterval } from "./interval";

// 空のワーカー。ジョブ表を一定の間隔で見に行く。取得処理は #3 で作る。
const { db } = connect();
console.log("worker started");

let idle = 0;
for (;;) {
  const rows = await db.execute(dsql`select count(*)::int as n from jobs where status = 'queued'`);
  const queued = Number((rows[0] as { n: number }).n);
  idle = queued === 0 ? idle + 1 : 0;
  await new Promise((r) => setTimeout(r, pickInterval(idle)));
}
