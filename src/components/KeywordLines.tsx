"use client";
import { useState } from "react";
import { MAX_TERM } from "../lib/chat-filter";
import { addKeyword, MAX_LINES } from "../lib/term";

const REASON = {
  empty: "言葉を入力してください",
  duplicate: "すでに追加しています",
  full: `重ねられるのは ${MAX_LINES} つまでです`,
  long: `${MAX_TERM} 文字までです`,
} as const;

export type KeywordInfo = {
  term: string;
  color: string;
  /** 数えたコメントの件数。読み込み中は null。 */
  count: number | null;
};

/**
 * グラフに重ねる言葉の入力欄（#53）。最大 2 つ。追加した言葉は系列色の印（■）つきの札で並べる。
 * 追加・削除はすぐ反映する。
 */
export function KeywordLines({
  items,
  total,
  onChange,
}: {
  items: KeywordInfo[];
  total: number;
  onChange: (terms: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const terms = items.map((i) => i.term);
  const full = terms.length >= MAX_LINES;
  const add = () => {
    const r = addKeyword(terms, text);
    if (!r.ok) {
      setError(REASON[r.reason]);
      return;
    }
    setError(null);
    setText("");
    onChange(r.list);
  };
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
      <label htmlFor="keyword-lines">言葉・スタンプを重ねる</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id="keyword-lines"
          type="text"
          maxLength={MAX_TERM}
          value={text}
          disabled={full}
          placeholder="例：草、:face-with-tears-of-joy:"
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: "border-box",
            minHeight: 44,
            padding: "0 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--text)",
            font: "inherit",
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={full || text.trim() === ""}
          style={{
            minHeight: 44,
            minWidth: 56,
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          追加
        </button>
      </div>
      {(error || full) && <span role="alert">{error ?? REASON.full}</span>}
      {items.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {items.map((i) => (
            <li
              key={i.term}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid var(--line)",
                borderRadius: 16,
                paddingLeft: 10,
                color: "var(--text)",
                overflowWrap: "anywhere",
              }}
            >
              <span aria-hidden style={{ color: i.color }}>
                ■
              </span>
              <span>
                「{i.term}」
                {i.count === null
                  ? ""
                  : `${i.count.toLocaleString("ja-JP")} / 全 ${total.toLocaleString("ja-JP")} 件`}
              </span>
              <button
                type="button"
                aria-label={`${i.term} を外す`}
                onClick={() => onChange(terms.filter((x) => x !== i.term))}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  border: 0,
                  background: "none",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
