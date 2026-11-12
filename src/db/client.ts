import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  const sql = postgres(url);
  return { sql, db: drizzle(sql, { schema }) };
}
