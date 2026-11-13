"use client";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { type Bucket, formatTime, groupBuckets, indexAtX, peakIndex } from "../lib/chart";
import {
  clampRange,
  panRange,
  type Range,
  revealIndex,
  snapRange,
  timeTicks,
  valueTicks,
  zoomRange,
} from "../lib/chart-range";

const MAX_BARS = 120;
const HEIGHT = 140;
const AXIS_LEFT = 36;
const AXIS_BOTTOM = 22;
const AXIS_RIGHT = 16;
const DRAG_THRESHOLD = 4;

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

type Pointer = { x: number; y: number };

/**
 * 30秒ごとのコメント数の棒グラフ。棒を押すとその開始時刻を onSeek に渡す。
 * 棒が細いスマホでも選べるように、指でなぞると指の下の棒を示して離した所で再生し、
 * 44px の「‹」「›」で前後の棒へ1本ずつ動かせる。
 * 横方向は、Ctrl＋ホイール・2本指のピンチ・「+」「-」キーで拡大し、拡大中はマウスのドラッグか
 * 2本指で横に動かせる（拡大の計算は lib/chart-range.ts）。再生中の位置は縦線で示す。
 */
export function BucketChart({
  buckets,
  onSeek,
  getTime,
  filtered = false,
}: {
  buckets: Bucket[];
  onSeek: (sec: number) => void;
  /** プレイヤーの再生位置（秒）。あれば約1秒ごとに読んで縦線で示す。 */
  getTime?: () => number;
  /** 絞り込み中。空の文言と棒の説明を「一致」にする。 */
  filtered?: boolean;
}) {
  const total = buckets.length;
  // 選んだ棒は元の区間の番号で持つ（拡大・移動しても同じ棒を指す）。
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [rangeState, setRangeState] = useState<Range | null>(null);
  const [playSec, setPlaySec] = useState(0);
  const plot = useRef<HTMLDivElement>(null);
  // 指で選んだ直後に来る click で、別の棒を選び直さないための印。
  const touchPicked = useRef(false);
  const pointers = useRef(new Map<number, Pointer>());
  // 2本指の操作中（指を全部離すまで、1本指の選択はしない）。
  const gesture = useRef<{
    dist: number;
    cx: number;
    range: Range;
  } | null>(null);
  const multi = useRef(false);
  const drag = useRef<{ x: number; range: Range; moved: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const full: Range = { start: 0, end: total };
  // 操作中の範囲は小数のまま持ち（少しずつの拡大・移動を積み重ねられる）、表示と棒の番号は整数にそろえる。
  const exact = rangeState ? clampRange(rangeState, total) : full;
  const range = snapRange(exact, total);
  const zoomed = range.end - range.start < total;
  const view = buckets.slice(range.start, range.end);
  const bars = groupBuckets(view, MAX_BARS);
  const group = Math.max(1, Math.ceil(view.length / MAX_BARS));
  const peak = peakIndex(bars);
  const top = valueTicks(Math.max(1, ...bars.map((b) => b.count))).at(-1) ?? 1;
  const barOf = (raw: number | null) =>
    raw === null || raw < range.start || raw >= range.end
      ? null
      : Math.floor((raw - range.start) / group);
  const selectedBar = barOf(selected);
  const shown = hover ?? selectedBar;
  const shownBar = shown === null ? null : bars[shown];

  const bucketSec = total > 1 ? buckets[1].startSec - buckets[0].startSec : 30;
  const fromSec = view[0]?.startSec ?? 0;
  const toSec = (view[view.length - 1]?.startSec ?? 0) + bucketSec;
  const xOf = (sec: number) => ((sec - fromSec) / (toSec - fromSec)) * 100;

  // 最新の値を、画面の外のイベント（ホイール）から使うための置き場。
  const latest = useRef({ range: exact, total });
  latest.current = { range: exact, total };

  useEffect(() => {
    if (!getTime) return;
    const read = () => setPlaySec(getTime());
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [getTime]);

  const hasBars = bars.length > 0 && peak !== -1;
  // Ctrl＋ホイール（トラックパッドのピンチも ctrlKey 付きで来る）で拡大・縮小する。
  // ページの拡大を止めるため、passive にしない形で登録する。
  useEffect(() => {
    const el = plot.current;
    if (!el || !hasBars) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { range: cur, total: n } = latest.current;
      const factor = Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.004);
      setRangeState(zoomRange(cur, n, (e.clientX - r.left) / r.width, factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasBars]);

  if (!hasBars) {
    return (
      <p style={{ margin: 0, padding: "32px 0", textAlign: "center", color: "var(--muted)" }}>
        {filtered ? "一致するコメントがありません" : "コメントがありません"}
      </p>
    );
  }

  const pick = (raw: number) => {
    setSelected(raw);
    setRangeState(revealIndex(exact, total, raw));
    onSeek(buckets[raw].startSec);
  };
  const pickBar = (i: number) => pick(range.start + i * group);
  const step = (d: -1 | 1) => {
    const from = selected ?? (d === 1 ? -group : total);
    const base = barOf(selected) === null ? from : range.start + (barOf(selected) ?? 0) * group;
    pick(Math.min(total - 1, Math.max(0, base + d * group)));
  };
  const zoomBy = (factor: number, anchor: number) =>
    setRangeState(zoomRange(exact, total, anchor, factor));
  const rect = () => plot.current?.getBoundingClientRect();
  const fingerIndex = (e: PointerEvent<HTMLDivElement>) => {
    const r = rect();
    return r ? indexAtX(e.clientX - r.left, r.width, bars.length) : -1;
  };

  const startGesture = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      cx: (a.x + b.x) / 2,
      range: exact,
    };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (e.pointerType === "mouse") {
      if (e.button === 0 && zoomed)
        drag.current = { x: e.clientX, range: exact, moved: false, id: e.pointerId };
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      multi.current = true;
      setHover(null);
      startGesture();
      return;
    }
    touchPicked.current = false;
    const i = fingerIndex(e);
    if (i >= 0) setHover(i);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      const d = drag.current;
      const r = rect();
      if (!d || !r || e.pointerId !== d.id) return;
      if (!d.moved && Math.abs(e.clientX - d.x) < DRAG_THRESHOLD) return;
      if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
      d.moved = true;
      dragged.current = true;
      const w = d.range.end - d.range.start;
      setRangeState(panRange(d.range, total, -((e.clientX - d.x) / r.width) * w));
      return;
    }
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const r = rect();
    if (g && r && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const cx = (a.x + b.x) / 2;
      const zoomedRange = zoomRange(g.range, total, (g.cx - r.left) / r.width, g.dist / dist);
      const w = zoomedRange.end - zoomedRange.start;
      setRangeState(panRange(zoomedRange, total, -((cx - g.cx) / r.width) * w));
      return;
    }
    if (multi.current || hover === null) return;
    const i = fingerIndex(e);
    if (i >= 0) setHover(i);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      drag.current = null;
      return;
    }
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (multi.current) {
      if (pointers.current.size === 0) multi.current = false;
      setHover(null);
      touchPicked.current = true; // 2本指の操作のあとの click で選ばない
      return;
    }
    if (hover === null) return;
    const i = fingerIndex(e);
    setHover(null);
    if (i >= 0) {
      touchPicked.current = true;
      pickBar(i);
    }
  };
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    drag.current = null;
    if (pointers.current.size === 0) multi.current = false;
    setHover(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const anchor = selectedBar === null ? 0.5 : (selectedBar + 0.5) / bars.length;
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Home") pick(0);
    else if (e.key === "End") pick(total - 1);
    else if (e.key === "+" || e.key === "=") zoomBy(0.5, anchor);
    else if (e.key === "-") zoomBy(2, anchor);
    else return;
    e.preventDefault();
  };

  const ticks = timeTicks(fromSec, toSec);
  const yTicks = valueTicks(Math.max(1, ...bars.map((b) => b.count)));
  const label = (b: Bucket) =>
    `${formatTime(b.startSec)} から ${filtered ? `一致 ${b.count} 件` : `${b.count} コメント`}`;
  const playX = playSec > 0 && playSec >= fromSec && playSec < toSec ? xOf(playSec) : null;

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
          disabled={selected !== null && selected + group >= total}
          style={stepButton}
        >
          ›
        </button>
      </div>
      <div
        style={{
          position: "relative",
          marginLeft: AXIS_LEFT,
          marginRight: AXIS_RIGHT,
          marginTop: 20,
          marginBottom: AXIS_BOTTOM,
          height: HEIGHT,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -18,
            right: "100%",
            paddingRight: 6,
            fontSize: 11,
            color: "var(--muted)",
            whiteSpace: "nowrap",
          }}
        >
          件
        </span>
        {yTicks.map((v) => (
          <div
            key={v}
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${(v / top) * 100}%`,
              borderTop: "1px solid var(--line)",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                right: "100%",
                paddingRight: 6,
                transform: "translateY(-50%)",
                fontSize: 11,
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
            >
              {v.toLocaleString("ja-JP")}
            </span>
          </div>
        ))}
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            style={{
              position: "absolute",
              top: "100%",
              left: `${xOf(t)}%`,
              paddingTop: 4,
              transform: "translateX(-50%)",
              fontSize: 11,
              color: "var(--muted)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {formatTime(t)}
          </span>
        ))}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 中の棒（button）で起きた操作をまとめて受ける入れ物。それ自体は操作の対象ではない */}
        <div
          ref={plot}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            gap: 1,
            touchAction: "pan-y",
            cursor: zoomed ? "grab" : undefined,
          }}
        >
          {bars.map((b, i) => (
            <button
              key={b.startSec}
              type="button"
              aria-label={label(b)}
              aria-pressed={selectedBar === i}
              onClick={() => {
                if (touchPicked.current || dragged.current) {
                  touchPicked.current = false;
                  dragged.current = false;
                  return;
                }
                pickBar(i);
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
                  height: `${Math.max(2, (b.count / top) * 100)}%`,
                  background:
                    selectedBar === i
                      ? "var(--accent-dark)"
                      : i === peak
                        ? "var(--accent)"
                        : "var(--chart-1)",
                  filter: hover === i ? "brightness(0.8)" : undefined,
                  outline: selectedBar === i ? "2px solid var(--accent-dark)" : "none",
                  outlineOffset: 1,
                  borderRadius: "2px 2px 0 0",
                }}
              />
            </button>
          ))}
        </div>
        {playX !== null && (
          <div
            aria-hidden
            data-testid="playhead"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${playX}%`,
              width: 2,
              marginLeft: -1,
              background: "var(--accent-dark)",
              pointerEvents: "none",
            }}
          />
        )}
        {hover !== null && bars[hover] && (
          <div
            aria-hidden
            role="presentation"
            style={{
              position: "absolute",
              left: `${((hover + 0.5) / bars.length) * 100}%`,
              bottom: `calc(${Math.max(2, (bars[hover].count / top) * 100)}% + 8px)`,
              transform: `translateX(${hover / bars.length < 0.15 ? "-10%" : hover / bars.length > 0.85 ? "-90%" : "-50%"})`,
              padding: "4px 8px",
              background: "var(--text)",
              color: "var(--surface)",
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {formatTime(bars[hover].startSec)} ・ {bars[hover].count.toLocaleString("ja-JP")} 件
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          minHeight: zoomed ? 44 : undefined,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span>Ctrl＋ホイール・2本指で拡大、拡大中はドラッグで移動</span>
        {zoomed && (
          <button
            type="button"
            onClick={() => setRangeState(null)}
            style={{
              flex: "0 0 auto",
              minHeight: 44,
              padding: "0 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--accent-dark)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            全体に戻す
          </button>
        )}
      </div>
    </div>
  );
}
