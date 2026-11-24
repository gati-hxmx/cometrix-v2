"use client";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/chart";
import {
  REEL_COUNTS,
  REEL_LENS,
  type ReelCount,
  type ReelLen,
  type ReelSettings,
  reelSettingText,
  reelTotalText,
} from "../lib/reel";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";

/**
 * 見どころを続けて再生（#61、案 I＋L）の操作。
 * 再生していないとき：［見どころ再生］と「上位 7・30 秒 ▾」（押すと数と長さを選ぶ小さなメニュー、部品 5-9）。
 * 再生中：「3 / 7・時刻・あと N 秒」と ‹ › ［止める］。スマホでグラフが画面の外に出たら、下に同じ列（ReelMini）。
 */

const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minWidth: 44,
  minHeight: 44,
  padding: "0 12px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
} as const;
const iconBtn = { ...btn, width: 44, padding: 0, fontSize: 20 } as const;

const COUNT_CHOICES = REEL_COUNTS.map((c) => ({
  key: String(c),
  name: c === 0 ? "全部" : `上位 ${c}`,
}));
const LEN_CHOICES = REEL_LENS.map((l) => ({ key: String(l), name: `${l} 秒` }));

export type ReelNow = {
  index: number;
  count: number;
  /** いまの山の時刻（グラフの番号の位置） */
  peakSec: number;
  remain: number;
};

/** 再生していないときの［見どころ再生］と、数・長さのメニュー */
export function ReelStart({
  settings,
  onSettings,
  totalSec,
  onStart,
}: {
  settings: ReelSettings;
  onSettings: (s: ReelSettings) => void;
  totalSec: number;
  onStart: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button
        type="button"
        onClick={onStart}
        style={{
          ...btn,
          background: "var(--accent)",
          borderColor: "var(--accent)",
          color: "var(--surface)",
        }}
      >
        <Icon name="play" />
        見どころ再生
      </button>
      <div>
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`見どころの数と長さ：${reelSettingText(settings)}`}
          onClick={() => setOpen((o) => !o)}
          style={btn}
        >
          {reelSettingText(settings)}
          <Icon name="chevron-down" size={16} />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="見どころの数と長さ"
            className="reel-pop"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              zIndex: 20,
              padding: 12,
              display: "grid",
              gap: 8,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              boxShadow: "0 8px 24px var(--shadow)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)" }}>見どころの数</span>
            <div style={{ display: "flex" }}>
              <Segmented
                label="見どころの数"
                options={COUNT_CHOICES}
                value={String(settings.count)}
                onChange={(k) => onSettings({ ...settings, count: Number(k) as ReelCount })}
              />
            </div>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>1つの長さ</span>
            <div style={{ display: "flex" }}>
              <Segmented
                label="1つの長さ"
                options={LEN_CHOICES}
                value={String(settings.len)}
                onChange={(k) => onSettings({ ...settings, len: Number(k) as ReelLen })}
              />
            </div>
            <span aria-live="polite" style={{ fontSize: 13, color: "var(--muted)" }}>
              合計 {reelTotalText(totalSec)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 再生中の「3 / 7・時刻・あと N 秒」と ‹ › ［止める］。compact は画面の下の列用（あと N 秒を省く） */
export function ReelStatus({
  now,
  onPrev,
  onNext,
  onStop,
  compact = false,
}: {
  now: ReelNow;
  onPrev: () => void;
  onNext: () => void;
  onStop: () => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {/* 読み上げは見どころが替わったときだけ（あと N 秒は毎秒変わるので入れない） */}
        <span aria-live="polite" style={{ display: "contents" }}>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {now.index + 1} / {now.count}
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {formatTime(now.peakSec)}
          </span>
        </span>
        {!compact && (
          <span
            aria-hidden
            className="reel-remain"
            style={{ color: "var(--muted)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}
          >
            あと {now.remain} 秒
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label="前の見どころ"
        onClick={onPrev}
        disabled={now.index === 0}
        style={iconBtn}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="次の見どころ"
        onClick={onNext}
        disabled={now.index + 1 >= now.count}
        style={iconBtn}
      >
        ›
      </button>
      {/* ■ だけでは伝わらないので、スマホでも「止める」を添える（部品 3-1） */}
      <button type="button" aria-label="見どころ再生を止める" onClick={onStop} style={btn}>
        <Icon name="square" size={18} />
        止める
      </button>
    </div>
  );
}

/** 進み具合の帯（済んだ・いま・まだ） */
export function ReelProgress({ now }: { now: ReelNow }) {
  return (
    <div aria-hidden style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: now.count }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: 帯の位置そのものが中身
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background:
              i < now.index
                ? "var(--accent-line)"
                : i === now.index
                  ? "var(--accent)"
                  : "var(--surface-2)",
          }}
        />
      ))}
    </div>
  );
}

/** スマホで、グラフが画面の外に出ている間だけ下に出す列（PC では出さない：.reel-mini） */
export function ReelMini({
  now,
  onPrev,
  onNext,
  onStop,
}: {
  now: ReelNow;
  onPrev: () => void;
  onNext: () => void;
  onStop: () => void;
}) {
  return (
    <section
      aria-label="見どころ再生"
      className="reel-mini"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 15,
        gap: 6,
        padding: "8px 16px calc(8px + env(safe-area-inset-bottom, 0px))",
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <ReelStatus now={now} onPrev={onPrev} onNext={onNext} onStop={onStop} compact />
      <ReelProgress now={now} />
    </section>
  );
}
