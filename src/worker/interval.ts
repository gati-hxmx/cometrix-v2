/** 空振りが続くほど見に行く間隔を延ばす（1秒から最大10秒）。 */
export function pickInterval(idleCount: number): number {
  return Math.min(1000 * 2 ** Math.max(0, idleCount - 1), 10_000);
}
