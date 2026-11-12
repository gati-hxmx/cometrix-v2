export const BUCKET_SECONDS = 30;

export type ChatMessage = { offsetMs: number; author: string; text: string };
export type Bucket = { startSec: number; count: number };

/** 動画開始前（時刻が負）のコメントを除く。 */
export function inVideo(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.offsetMs >= 0);
}

/** 0秒から30秒ごとのコメント数。区間は [開始, 開始+30秒)。最後のコメントの区間まで、0件の区間も含めて連続で返す。 */
export function bucketize(messages: ChatMessage[]): Bucket[] {
  const valid = inVideo(messages);
  if (valid.length === 0) return [];
  const size = BUCKET_SECONDS * 1000;
  let lastMs = 0;
  for (const m of valid) lastMs = Math.max(lastMs, m.offsetMs);
  const counts = new Array<number>(Math.floor(lastMs / size) + 1).fill(0);
  for (const m of valid) counts[Math.floor(m.offsetMs / size)]++;
  return counts.map((count, i) => ({ startSec: i * BUCKET_SECONDS, count }));
}
