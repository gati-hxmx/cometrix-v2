import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { sessions, userJobs, users } from "../db/schema";
import { type GoogleProfile, randomToken } from "./google";

/** ログインの鍵（#7）。Cookie には鍵そのもの、DB にはそのハッシュだけ。 */

type Db = ReturnType<typeof connect>["db"];

export const SESSION_COOKIE = "cx_session";
export const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  createdAt: Date;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Google の利用者 ID で探し、なければ作る。あれば名前などとログインの時刻を新しくする */
export async function upsertUser(db: Db, p: GoogleProfile): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ googleSub: p.sub, email: p.email, name: p.name, picture: p.picture })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email: p.email, name: p.name, picture: p.picture, lastLoginAt: sql`now()` },
    })
    .returning({ id: users.id });
  return row.id;
}

/** 新しい鍵を作って保存し、Cookie に入れる鍵そのものを返す */
export async function createSession(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** 鍵から利用者を読む。ない・期限切れなら null */
export async function readSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)));
  return row ?? null;
}

export async function deleteSession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** 分析を利用者に紐づける（同じものは1つ） */
export async function linkJob(db: Db, userId: string, jobId: string): Promise<void> {
  await db.insert(userJobs).values({ userId, jobId }).onConflictDoNothing();
}
