"use client";
import {
  REACTION_KEYS,
  type ReactionKey,
  type ReactionKind,
  reactionColor,
  reactionName,
  sharePercent,
} from "../lib/reactions";

/**
 * 反応の種類の札（#62、案 K）。「すべて」と6つの種類を並べ、押した種類をグラフの棒のいちばん下に置いて浮かせる。
 * 札には件数（スマホは省く：.reaction-count）。選んでいるときは下に「神 1,135 件（全体の 11%）」。
 */
export function ReactionChips({
  totals,
  focus,
  onFocus,
}: {
  /** 種類ごとの合計。読み込み中は null */
  totals: Record<ReactionKind, number> | null;
  focus: ReactionKey | null;
  onFocus: (k: ReactionKey | null) => void;
}) {
  const all = totals ? Object.values(totals).reduce((s, n) => s + n, 0) : 0;
  const chip = (on: boolean) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      padding: "0 12px",
      borderRadius: 999,
      border: `1px solid ${on ? "var(--accent-line)" : "var(--line)"}`,
      background: on ? "var(--accent-weak)" : "var(--surface)",
      color: on ? "var(--accent-dark)" : focus ? "var(--muted)" : "var(--text)",
      font: "inherit",
      fontSize: 14,
      fontWeight: 700,
      whiteSpace: "nowrap",
      cursor: "pointer",
    }) as const;
  return (
    <div style={{ marginTop: 8 }}>
      <fieldset
        aria-label="反応の種類（押すとその種類を浮かせる）"
        style={{ margin: 0, padding: 0, border: 0, display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        <button
          type="button"
          aria-pressed={focus === null}
          onClick={() => onFocus(null)}
          style={chip(focus === null)}
        >
          すべて
        </button>
        {REACTION_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={focus === k}
            onClick={() => onFocus(focus === k ? null : k)}
            style={chip(focus === k)}
          >
            <span
              aria-hidden
              style={{ width: 10, height: 10, borderRadius: 3, background: reactionColor(k) }}
            />
            {reactionName(k)}
            {totals && (
              <span className="reaction-count" style={{ fontWeight: 400, color: "var(--muted)" }}>
                {totals[k].toLocaleString("ja-JP")}
              </span>
            )}
          </button>
        ))}
      </fieldset>
      {focus && totals && (
        <p aria-live="polite" style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
          {reactionName(focus)} {totals[focus].toLocaleString("ja-JP")} 件（全体の{" "}
          {sharePercent(totals[focus], all)}%）
        </p>
      )}
    </div>
  );
}
