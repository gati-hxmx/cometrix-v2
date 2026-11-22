"use client";

/**
 * 表示の切り替え（つながった札「A｜B」、基本 4）。枠の右端に置く。
 * 選んでいる側は `--accent-weak` の地・`--accent-dark` の文字。押せる高さは 44px。
 * 各札は押した状態（aria-pressed）を持つボタンで、Tab で順に選べる。
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** 読み上げ用のまとまりの名前。 */
  label: string;
  options: readonly { key: K; name: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      style={{
        margin: 0,
        // 折り返しても右端に寄せる（基本 4）。
        marginLeft: "auto",
        padding: 0,
        minWidth: 0,
        display: "inline-flex",
        flex: "0 0 auto",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            style={{
              minHeight: 44,
              minWidth: 48,
              padding: "0 10px",
              font: "inherit",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              border: 0,
              borderLeft: i === 0 ? 0 : "1px solid var(--line)",
              background: on ? "var(--accent-weak)" : "var(--surface)",
              color: on ? "var(--accent-dark)" : "var(--text)",
            }}
          >
            {o.name}
          </button>
        );
      })}
    </fieldset>
  );
}
