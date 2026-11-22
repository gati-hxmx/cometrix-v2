import { connect } from "../db/client";
import { parsePurgeDays, purgeStale } from "../lib/purge";
import { type ChatFetcher, fetchWithYtDlp } from "./fetch-chat";
import { pickInterval } from "./interval";
import { processNext, reapStale } from "./process";
import { fetchWithTwitch } from "./twitch-chat";

const fetchChat: ChatFetcher = (videoId, url, platform, onProgress) =>
  (platform === "twitch" ? fetchWithTwitch : fetchWithYtDlp)(videoId, url, platform, onProgress);

// ジョブ表を見に行き、queued を1件ずつ処理する。待ちがなければ間隔を延ばす。
const { db } = connect();
console.log("worker started");

const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;
const purgeDays = parsePurgeDays(process.env.PURGE_AFTER_DAYS);
if (purgeDays === null)
  console.error("PURGE_AFTER_DAYS が不正（1以上の整数）なので、古い分析の掃除はしません");

let idle = 0;
let lastReap = 0;
let lastPurge = 0;
for (;;) {
  try {
    if (purgeDays !== null && Date.now() - lastPurge > PURGE_EVERY_MS) {
      lastPurge = Date.now();
      const n = await purgeStale(db, { days: purgeDays });
      console.log(`purged messages of ${n} analyses (older than ${purgeDays} days)`);
    }
    if (Date.now() - lastReap > 60_000) {
      await reapStale(db);
      lastReap = Date.now();
    }
    const worked = await processNext(db, fetchChat);
    idle = worked ? 0 : idle + 1;
    if (worked) continue;
  } catch (e) {
    console.error("worker error", e);
    idle += 1;
  }
  await new Promise((r) => setTimeout(r, pickInterval(idle)));
}
