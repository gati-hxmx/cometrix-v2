/** Twitch の URL の t= に使う形（例：3725 → 1h2m5s）。 */
export function twitchTimeParam(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`;
}
