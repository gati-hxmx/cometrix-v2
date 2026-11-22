import { formatTime } from "../lib/chart";

/** 自動再生が止められたときに、動画の枠の中央へ出す「この時刻から再生」ボタン（#20）。 */
export function ResumeButton({ sec, onPlay }: { sec: number; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      style={{
        minHeight: 44,
        maxWidth: "100%",
        padding: "0 16px",
        border: "none",
        borderRadius: "var(--radius)",
        background: "var(--accent)",
        color: "var(--on-accent)",
        font: "inherit",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      ▶ {formatTime(sec)} から再生
    </button>
  );
}
