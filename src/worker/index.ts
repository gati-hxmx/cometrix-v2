import { connect } from "../db/client";
import { type ChatFetcher, fetchWithYtDlp } from "./fetch-chat";
import { pickInterval } from "./interval";
import { processNext, reapStale } from "./process";
import { fetchWithTwitch } from "./twitch-chat";

const fetchChat: ChatFetcher = (videoId, url, platform) =>
  (platform === "twitch" ? fetchWithTwitch : fetchWithYtDlp)(videoId, url, platform);

// ジョブ表を見に行き、queued を1件ずつ処理する。待ちがなければ間隔を延ばす。
const { db } = connect();
console.log("worker started");

let idle = 0;
let lastReap = 0;
for (;;) {
  try {
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
