import { type SQL, sql } from "drizzle-orm";
import { chatMessages } from "../db/schema";
import type { Filter } from "./chat-filter";

/** 絞り込みを SQL の条件にする（matches と同じ規則。語はパラメータとして渡す）。 */
export function filterConds(f: Filter): SQL[] {
  const any = (col: typeof chatMessages.body | typeof chatMessages.author, terms: string[]) =>
    sql`(${sql.join(
      terms.map((t) => sql`strpos(lower(${col}), ${t}) > 0`),
      sql` or `,
    )})`;
  const conds: SQL[] = [];
  if (f.q.length) conds.push(any(chatMessages.body, f.q));
  if (f.user.length) conds.push(any(chatMessages.author, f.user));
  if (f.xq.length) conds.push(sql`not ${any(chatMessages.body, f.xq)}`);
  if (f.xuser.length) conds.push(sql`not ${any(chatMessages.author, f.xuser)}`);
  return conds;
}
