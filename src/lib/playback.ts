export const STEP_MIN = 1;
export const STEP_MAX = 3600;
export const STEP_DEFAULT = 10;

/** 30秒あたりの平均コメント数（小数第1位）。区間が0なら 0。 */
export function averagePerBucket(total: number, bucketCount: number): number {
  if (bucketCount <= 0 || total <= 0) return 0;
  return Math.round((total / bucketCount) * 10) / 10;
}

/** 今の位置から delta 秒動かした先。0 秒未満にならず、秒未満は切り捨てる。 */
export function seekTarget(current: number, delta: number): number {
  return Math.max(0, Math.floor(current) + delta);
}

/** 「N 秒」の入力。1〜3600 の整数（半角数字のみ）なら数、そうでなければ null。 */
export function parseStepSec(text: string): number | null {
  if (!/^[0-9]+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= STEP_MIN && n <= STEP_MAX ? n : null;
}
