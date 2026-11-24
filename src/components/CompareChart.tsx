"use client";
import { useEffect, useRef, useState } from "react";
import { formatTime, indexAtX } from "../lib/chart";
import { maxTickCount, timeTicks, valueTicks } from "../lib/chart-range";
import { bandRuns, valueText } from "../lib/compare";

/**
 * コラボを重ねて比べるグラフ（#63、案 J）。配信ごとの線を同じ時間軸に重ねる。
 * 薄い青の帯：一緒に盛り上がった所。押す・なぞると縦線（cursor）を引き、PC はグラフの中の小窓に全員の数を出す。
 * 小窓は線にかからないよう、縦線の右か左の空いている方に出す。スマホは小窓を出さず、名前の札に数を出す（CompareView）。
 */

const HEIGHT = 180;
const AXIS_LEFT = 40;
const AXIS_BOTTOM = 22;
const AXIS_RIGHT = 12;
const BUCKET = 30;
const TIP_W = 180;

export type CompareLine = {
  key: string;
  name: string;
  color: string;
  values: (number | null)[];
};

export function CompareChart({
  lines,
  bands,
  ratio,
  cursor,
  focus,
  onCursor,
  label,
}: {
  lines: CompareLine[];
  bands: boolean[];
  /** 割合（各配信の最大を 100%）で描くか */
  ratio: boolean;
  /** 縦線を引いた区間の番号 */
  cursor: number | null;
  /** プレイヤーで見ている配信（線を太く） */
  focus: number;
  onCursor: (k: number, play: boolean) => void;
  label: string;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const n = Math.max(0, ...lines.map((l) => l.values.length));

  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = ratio
    ? 100
    : Math.max(1, ...lines.flatMap((l) => l.values.filter((v): v is number => v !== null)));
  const yTicks = ratio ? [0, 50, 100] : valueTicks(max);
  const top = yTicks[yTicks.length - 1] || 1;
  const xTicks = timeTicks(0, n * BUCKET, maxTickCount(width));
  const xOf = (k: number) => (n > 0 ? ((k + 0.5) / n) * 100 : 0);

  const pickAt = (clientX: number, play: boolean) => {
    const el = plot.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const k = indexAtX(clientX - r.left, r.width, n);
    if (k >= 0) onCursor(k, play);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (n === 0) return;
    const at = cursor ?? -1;
    if (e.key === "ArrowRight") onCursor(Math.min(n - 1, at + 1), false);
    else if (e.key === "ArrowLeft") onCursor(Math.max(0, at < 0 ? 0 : at - 1), false);
    else if (e.key === "Home") onCursor(0, false);
    else if (e.key === "End") onCursor(n - 1, false);
    else if ((e.key === "Enter" || e.key === " ") && cursor !== null) onCursor(cursor, true);
    else return;
    e.preventDefault();
  };

  // 小窓：縦線の右に入るなら右、入らなければ左
  const cursorPx = cursor !== null ? (xOf(cursor) / 100) * width : 0;
  const tipRight = cursorPx + 12 + TIP_W <= width;

  return (
    <div>
      <div
        ref={plot}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, n - 1) * BUCKET}
        aria-valuenow={(cursor ?? 0) * BUCKET}
        aria-valuetext={cursor === null ? "時刻を選んでいません" : formatTime(cursor * BUCKET)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pickAt(e.clientX, false);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickAt(e.clientX, false);
        }}
        onPointerUp={(e) => pickAt(e.clientX, true)}
        style={{
          position: "relative",
          marginLeft: AXIS_LEFT,
          marginRight: AXIS_RIGHT,
          marginTop: 20,
          marginBottom: AXIS_BOTTOM,
          height: HEIGHT,
          cursor: "crosshair",
          touchAction: "pan-y",
          outlineOffset: 4,
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
          {ratio ? "%" : "件"}
        </span>
        {bandRuns(bands).map((b) => (
          <div
            key={b.start}
            aria-hidden
            data-testid="together-band"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(b.start / n) * 100}%`,
              width: `${((b.end - b.start) / n) * 100}%`,
              background: "var(--accent-weak)",
              pointerEvents: "none",
            }}
          />
        ))}
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
              {ratio ? `${v}%` : v.toLocaleString("ja-JP")}
            </span>
          </div>
        ))}
        {xTicks.map((t) => (
          <span
            key={t}
            aria-hidden
            style={{
              position: "absolute",
              top: "100%",
              left: `${(t / (n * BUCKET)) * 100}%`,
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
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {lines.map((l, j) =>
            segments(l.values).map((seg) => (
              <polyline
                key={`${l.key}-${seg[0]}`}
                data-line={l.key}
                fill="none"
                stroke={l.color}
                strokeWidth={j === focus ? 3 : 1.75}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                points={seg
                  .map((k) => `${xOf(k)},${100 - ((l.values[k] as number) / top) * 100}`)
                  .join(" ")}
              />
            )),
          )}
        </svg>
        {cursor !== null && (
          <>
            <div
              aria-hidden
              data-testid="compare-cursor"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${xOf(cursor)}%`,
                borderLeft: "1.5px dashed var(--text)",
                pointerEvents: "none",
              }}
            />
            {lines.map((l) => {
              const v = l.values[cursor];
              if (v === null || v === undefined) return null;
              return (
                <span
                  key={l.key}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${xOf(cursor)}%`,
                    bottom: `${(v / top) * 100}%`,
                    width: 10,
                    height: 10,
                    marginLeft: -5,
                    marginBottom: -5,
                    borderRadius: "50%",
                    background: "var(--surface)",
                    border: `2.5px solid ${l.color}`,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                />
              );
            })}
            <div
              aria-hidden
              className="compare-tip"
              data-testid="compare-tip"
              style={{
                position: "absolute",
                top: 4,
                ...(tipRight
                  ? { left: `calc(${xOf(cursor)}% + 12px)` }
                  : { right: `calc(${100 - xOf(cursor)}% + 12px)` }),
                width: TIP_W,
                padding: "8px 10px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                boxShadow: "0 4px 12px var(--shadow)",
                fontSize: 12,
                pointerEvents: "none",
              }}
            >
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatTime(cursor * BUCKET)}
              </strong>
              {lines.map((l) => (
                <div
                  key={l.key}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: l.color,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.name}
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                    {valueText(l.values[cursor] ?? null, ratio)}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** null で切れた、続いている区間の番号の並び（配信していない所は線を引かない） */
export function segments(values: (number | null)[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  values.forEach((v, k) => {
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(k);
  });
  if (cur.length) out.push(cur);
  return out;
}
