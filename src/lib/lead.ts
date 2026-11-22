/** 山（グラフの棒）を押したとき、何秒前から再生するか。保存先は localStorage の cometrix-lead-sec。 */
export const LEAD_KEY = "cometrix-lead-sec";
export const LEAD_OPTIONS = [0, 10, 20, 30] as const;
export type Lead = (typeof LEAD_OPTIONS)[number];
export const LEAD_DEFAULT: Lead = 20;

/** 保存された文字を秒数に戻す。選べる値以外（壊れた保存・空）は初期値。 */
export function parseLead(v: string | null | undefined): Lead {
  const n = v === null || v === undefined || !/^[0-9]+$/.test(v) ? Number.NaN : Number(v);
  return LEAD_OPTIONS.find((o) => o === n) ?? LEAD_DEFAULT;
}

/** 棒の開始時刻から lead 秒前。0 秒より前にはならない。 */
export function leadTarget(startSec: number, lead: number): number {
  return Math.max(0, Math.floor(startSec) - lead);
}
