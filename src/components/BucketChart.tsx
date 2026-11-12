"use client";
import { useState } from "react";
import { type Bucket, formatTime, groupBuckets, peakIndex } from "../lib/chart";

const MAX_BARS = 120;
const HEIGHT = 140;

/** 30秒ごとのコメント数の棒グラフ。棒を押すとその開始時刻を onSeek に渡す。 */
export function BucketChart({
  buckets,
  onSeek,
}: {
  buckets: Bucket[];
  onSeek: (sec: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const bars = groupBuckets(buckets, MAX_BARS);
  const peak = peakIndex(bars);
  const max = Math.max(1, ...bars.map((b) => b.count));
  const shown = hover ?? selected;
  const shownBar = shown === null ? null : bars[shown];

  if (bars.length === 0 || peak === -1) {
    return (
      <p style={{ margin: 0, padding: "32px 0", textAlign: "center", color: "var(--muted)" }}>
        コメントがありません
      </p>
    );
  }
  return (
    <div>
      <p style={{ margin: "0 0 8px", minHeight: 22, color: "var(--muted)", fontSize: 14 }}>
        {shownBar
          ? `${formatTime(shownBar.startSec)} から ・ ${shownBar.count} コメント`
          : "棒を押すと、その時刻から再生します"}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", height: HEIGHT, gap: 1 }}>
        {bars.map((b, i) => (
          <button
            key={b.startSec}
            type="button"
            aria-label={`${formatTime(b.startSec)} から ${b.count} コメント`}
            aria-pressed={selected === i}
            onClick={() => {
              setSelected(i);
              onSeek(b.startSec);
            }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: "100%",
              padding: 0,
              border: 0,
              background: "transparent",
              display: "flex",
              alignItems: "flex-end",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                width: "100%",
                height: `${Math.max(2, (b.count / max) * 100)}%`,
                background: i === peak ? "var(--accent)" : "var(--chart-1)",
                outline: selected === i ? "2px solid var(--accent-dark)" : "none",
                outlineOffset: 1,
                borderRadius: "2px 2px 0 0",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
