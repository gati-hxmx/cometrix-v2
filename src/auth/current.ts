import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { readSession, SESSION_COOKIE, type SessionUser } from "./session";

/** 今ログインしている利用者（サーバーの画面と API 用）。Cookie がなければ DB を見ない */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await readSession(getDb(), token);
  } catch {
    // DB に届かないときは、ログインしていない扱いにして画面は出す
    return null;
  }
}
