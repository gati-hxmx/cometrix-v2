"use client";
import { useEffect, useState } from "react";
import { formatTime } from "../lib/chart";
import { averagePerBucket, parseStepSec, STEP_DEFAULT, seekTarget } from "../lib/playback";

const stat = { margin: 0, color: "var(--muted)", fontSize: 13 } as const;
const btn = {
  minWidth: 44,
  minHeight: 44,
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 18,
  cursor: "pointer",
} as const;

/** グラフの下の補助行：累計と平均、今の再生位置、「‹ N 秒 ›」。 */
export function PlaybackBar({
  total,
  bucketCount,
  getTime,
  onSeek,
  enabled,
}: {
  total: number;
  bucketCount: number;
  getTime: () => number;
  onSeek: (sec: number) => void;
  enabled: boolean;
}) {
  const [now, setNow] = useState(0);
  const [text, setText] = useState(String(STEP_DEFAULT));
  const step = parseStepSec(text);

  useEffect(() => {
    if (!enabled) {
      setNow(0);
      return;
    }
    const read = () => setNow(getTime());
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [enabled, getTime]);

  const move = (dir: 1 | -1) => {
    if (step === null || !enabled) return;
    const to = seekTarget(getTime(), dir * step);
    onSeek(to);
    setNow(to);
  };

  return (
    <section
      aria-label="再生の補助"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: 16,
        marginTop: 16,
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 24px",
        alignItems: "center",
      }}
    >
      <div>
        <p style={stat}>コメント 累計 {total.toLocaleString("ja-JP")} 件</p>
        <p style={stat}>
          30秒あたり 平均 {averagePerBucket(total, bucketCount).toLocaleString("ja-JP")} 件
        </p>
      </div>
      <p style={{ ...stat, color: "var(--text)" }}>
        再生位置 <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(now)}</strong>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          style={btn}
          disabled={!enabled || step === null}
          aria-label={`${step ?? "N"} 秒前へ`}
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={step === null}
            aria-describedby={step === null ? "step-error" : undefined}
            style={{
              width: 64,
              minHeight: 44,
              textAlign: "center",
              border: `1px solid ${step === null ? "var(--danger-line)" : "var(--line)"}`,
              borderRadius: "var(--radius)",
              font: "inherit",
            }}
          />
          秒
        </label>
        <button
          type="button"
          style={btn}
          disabled={!enabled || step === null}
          aria-label={`${step ?? "N"} 秒先へ`}
          onClick={() => move(1)}
        >
          ›
        </button>
      </div>
      {step === null && (
        <p id="step-error" style={{ ...stat, color: "var(--danger)", flexBasis: "100%" }}>
          1〜3600 の整数で入力してください
        </p>
      )}
    </section>
  );
}
