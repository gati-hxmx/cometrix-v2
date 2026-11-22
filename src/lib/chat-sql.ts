import { type SQL, sql } from "drizzle-orm";
import { chatMessages } from "../db/schema";
import { exactName, type Filter } from "./chat-filter";
import { LAUGH_PATTERN, LAUGH_TRIM } from "./laugh";
import { SPAM_LONG, SPAM_TRIM, SPAM_WINDOW_MS } from "./spam";

/** 絞り込みを SQL の条件にする（matches と同じ規則。語はパラメータとして渡す）。 */
export function filterConds(f: Filter): SQL[] {
  const any = (col: typeof chatMessages.body | typeof chatMessages.author, terms: string[]) =>
    sql`(${sql.join(
      terms.map((t) => sql`strpos(lower(${col}), ${t}) > 0`),
      sql` or `,
    )})`;
  const who = (terms: string[]) =>
    sql`(${sql.join(
      terms.map((t) => {
        const name = exactName(t);
        return name === null
          ? sql`strpos(lower(${chatMessages.author}), ${t}) > 0`
          : sql`lower(btrim(${chatMessages.author})) = ${name}`;
      }),
      sql` or `,
    )})`;
  const re = (terms: string[]) =>
    sql`(${sql.join(
      terms.map((t) => sql`${chatMessages.body} ~* ${t}`),
      sql` or `,
    )})`;
  const conds: SQL[] = [];
  if (f.re.length) conds.push(re(f.re));
  if (f.xre.length) conds.push(sql`not ${re(f.xre)}`);
  if (f.q.length) conds.push(any(chatMessages.body, f.q));
  if (f.user.length) conds.push(who(f.user));
  if (f.xq.length) conds.push(sql`not ${any(chatMessages.body, f.xq)}`);
  if (f.xuser.length) conds.push(sql`not ${who(f.xuser)}`);
  return conds;
}

/** 笑いのコメントだけにする条件（isLaugh と同じ規則。前後の空白・改行・全角スペースを除いてから見る）。 */
export function laughCond(): SQL {
  return sql`btrim(${chatMessages.body}, ${LAUGH_TRIM}) ~* ${LAUGH_PATTERN}`;
}

/** 言葉を含むコメントだけにする条件（hasTerm と同じ規則。term は normalizeKeyword 済み）。 */
export function termCond(term: string): SQL {
  return sql`strpos(lower(normalize(${chatMessages.body}, NFKC)), ${term}) > 0`;
}

/**
 * スパムを除いたコメントの表（spam.ts の dropSpam と同じ規則）。表の名前を chat_messages にそろえるので、
 * filterConds・laughCond をそのまま使える。動画開始前は含まない。
 * 同じ投稿者・同じ文（前後の空白を除き小文字）ごとに時刻順で直前との差を見る。
 */
export function spamFreeSource(jobId: string): SQL {
  return sql`(
    select * from (
      select m.*,
        m.offset_ms - lag(m.offset_ms) over (
          partition by m.author, lower(btrim(m.body, ${SPAM_TRIM}))
          order by m.offset_ms, m.id
        ) as gap_ms
      from chat_messages m
      where m.job_id = ${jobId} and m.offset_ms >= 0
    ) t
    where (t.gap_ms is null or t.gap_ms >= ${SPAM_WINDOW_MS})
      and char_length(btrim(t.body, ${SPAM_TRIM})) < ${SPAM_LONG}
  ) chat_messages`;
}

/** DB が正規表現を読めない・時間切れのときのエラーか（API が 400 にする）。 */
export function isBadPatternError(e: unknown): boolean {
  let x: unknown = e;
  for (let i = 0; i < 4 && x && typeof x === "object"; i++) {
    const code = (x as { code?: unknown }).code;
    if (code === "2201B" || code === "57014") return true;
    x = (x as { cause?: unknown }).cause;
  }
  return false;
}

/** 5 秒を超える絞り込みは打ち切る（重い正規表現でサーバーが止まらないように）。 */
export const FILTER_TIMEOUT_MS = 5000;
