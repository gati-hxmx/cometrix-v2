"use client";
import { type PointerEvent, useRef, useState } from "react";
import { type Bucket, formatTime, groupBuckets, indexAtX, peakIndex } from "../lib/chart";

const MAX_BARS = 120;
const HEIGHT = 140;

const stepButton = {
  flex: "0 0 auto",
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
} as const;

/**
 * 30秒ごとのコメント数の棒グラフ。棒を押すとその開始時刻を onSeek に渡す。
 * 棒が細いスマホでも選べるように、指でなぞると指の下の棒を示して離した所で再生し、
 * 44px の「‹」「›」で前後の棒へ1本ずつ動かせる。
 */
export function BucketChart({
  buckets,
  onSeek,
  filtered = false,
}: {
  buckets: Bucket[];
  onSeek: (sec: number) => void;
  /** 絞り込み中。空の文言と棒の説明を「一致」にする。 */
  filtered?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  // 指で選んだ直後に来る click で、別の棒を選び直さないための印。
  const touchPicked = useRef(false);
  const bars = groupBuckets(buckets, MAX_BARS);
  const peak = peakIndex(bars);
  const max = Math.max(1, ...bars.map((b) => b.count));
  const shown = hover ?? selected;
  const shownBar = shown === null ? null : bars[shown];

  if (bars.length === 0 || peak === -1) {
    return (
      <p style={{ margin: 0, padding: "32px 0", textAlign: "center", color: "var(--muted)" }}>
        {filtered ? "一致するコメントがありません" : "コメントがありません"}
      </p>
    );
  }

  const pick = (i: number) => {
    setSelected(i);
    onSeek(bars[i].startSec);
  };
  const step = (d: -1 | 1) => {
    const from = selected ?? (d === 1 ? -1 : bars.length);
    pick(Math.min(bars.length - 1, Math.max(0, from + d)));
  };
  const fingerIndex = (e: PointerEvent<HTMLDivElement>) => {
    const r = plot.current?.getBoundingClientRect();
    return r ? indexAtX(e.clientX - r.left, r.width, bars.length) : -1;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    touchPicked.current = false;
    const i = fingerIndex(e);
    if (i >= 0) setHover(i);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || hover === null) return;
    const i = fingerIndex(e);
    if (i >= 0) setHover(i);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || hover === null) return;
    const i = fingerIndex(e);
    setHover(null);
    if (i >= 0) {
      touchPicked.current = true;
      pick(i);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          aria-label="前の区間"
          onClick={() => step(-1)}
          disabled={selected === 0}
          style={stepButton}
        >
          ‹
        </button>
        <p
          aria-live="polite"
          style={{
            flex: "1 1 auto",
            margin: 0,
            textAlign: "center",
            color: "var(--muted)",
            fontSize: 14,
          }}
        >
          {shownBar
            ? `${formatTime(shownBar.startSec)} から ・ ${filtered ? `一致 ${shownBar.count} 件` : `${shownBar.count} コメント`}`
            : "棒を押すと、その時刻から再生します"}
        </p>
        <button
          type="button"
          aria-label="次の区間"
          onClick={() => step(1)}
          disabled={selected === bars.length - 1}
          style={stepButton}
        >
          ›
        </button>
      </div>
      <div
        ref={plot}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setHover(null)}
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: HEIGHT,
          gap: 1,
          touchAction: "pan-y",
        }}
      >
        {bars.map((b, i) => (
          <button
            key={b.startSec}
            type="button"
            aria-label={`${formatTime(b.startSec)} から ${filtered ? `一致 ${b.count} 件` : `${b.count} コメント`}`}
            aria-pressed={selected === i}
            onClick={() => {
              if (touchPicked.current) {
                touchPicked.current = false;
                return;
              }
              pick(i);
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
