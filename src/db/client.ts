import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let shared: ReturnType<typeof connect> | undefined;
/** API ルート用。最初に使うときに接続する（ビルド時に DATABASE_URL がなくても動くように）。 */
export function getDb() {
  shared ??= connect();
  return shared.db;
}

export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  const sql = postgres(url);
  return { sql, db: drizzle(sql, { schema }) };
}
