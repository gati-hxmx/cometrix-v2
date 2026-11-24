"use client";
import { useEffect, useMemo, useState } from "react";
import { type Bucket, formatTime } from "../lib/chart";
import { type ReactionKey, reactionColor, reactionName } from "../lib/reactions";
import { nearestIndex, pickPeaks } from "../lib/toc";

/** 時刻の目次（#51）。今グラフに出している数から盛り上がりの上位を並べ、押すとその時刻から再生する。 */
export function TocPanel({
  buckets,
  laugh,
  users = false,
  getTime,
  onSeek,
  tagOf,
}: {
  /** null は読み込み中 */
  buckets: Bucket[] | null;
  laugh: boolean;
  /** 人数（#55）のときは単位を「人」にする。 */
  users?: boolean;
  getTime: () => number;
  onSeek: (sec: number) => void;
  /** 山のいちばん多い反応（#62）。名札を出さないときは null */
  tagOf?: (sec: number) => ReactionKey | null;
}) {
  const entries = useMemo(() => (buckets ? pickPeaks(buckets) : null), [buckets]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const read = () => setNow(getTime());
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [getTime]);

  if (!entries) {
    return (
      <div aria-hidden style={{ height: 120, background: "var(--surface-2)", borderRadius: 6 }} />
    );
  }
  if (entries.length === 0) {
    return <p style={{ margin: 0, color: "var(--muted)" }}>目立つ盛り上がりはありません</p>;
  }
  // 再生位置が取れない（0 のまま）ときは印を付けない。
  const current = now ? nearestIndex(entries, now) : -1;

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
      {entries.map((e, i) => (
        <li key={e.startSec}>
          <button
            type="button"
            aria-current={i === current ? "true" : undefined}
            onClick={() => onSeek(e.startSec)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              minHeight: 44,
              padding: "0 12px",
              font: "inherit",
              textAlign: "left",
              cursor: "pointer",
              color: "var(--text)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              background: i === current ? "var(--accent-weak)" : "var(--surface)",
            }}
          >
            <span style={{ color: "var(--muted)", minWidth: 20 }}>{i + 1}</span>
            <span style={{ color: "var(--accent-dark)", fontWeight: 700 }}>
              {formatTime(e.startSec)}
            </span>
            {(() => {
              const k = tagOf?.(e.startSec);
              return k ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "1px 8px",
                    borderRadius: 999,
                    background: "var(--surface-2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: 2, background: reactionColor(k) }}
                  />
                  {reactionName(k)}
                </span>
              ) : null;
            })()}
            <span style={{ marginLeft: "auto" }}>
              {laugh ? "笑い " : ""}
              {e.count.toLocaleString("ja-JP")} {users ? "人" : "件"}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
