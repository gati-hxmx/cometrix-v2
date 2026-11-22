"use client";
import { useEffect, useState } from "react";

const button = {
  minHeight: 44,
  minWidth: 44,
  padding: "0 16px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: "var(--radius)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--text)",
} as const;

/**
 * 「もう一度分析する」（#99）。押すとその場で1回だけ聞く（部品 4-2。ブラウザの確認ダイアログは使わない）。
 * 続けて押せないよう、最後の更新から一定時間は押せず「あと N 秒」を出す。
 */
export function ReanalyzeButton({
  retryAfterSec,
  onConfirm,
  busy,
}: {
  retryAfterSec: number;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [left, setLeft] = useState(retryAfterSec);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  if (asking) {
    return (
      <div style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 14 }}>
          コメントと集計を消して、もう一度取得しますか？ メモは残ります。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={button} onClick={() => setAsking(false)}>
            戻る
          </button>
          <button
            type="button"
            disabled={busy}
            style={{
              ...button,
              background: "var(--accent)",
              borderColor: "var(--accent)",
              color: "var(--on-accent)",
            }}
            onClick={() => {
              setAsking(false);
              onConfirm();
            }}
          >
            取り直す
          </button>
        </div>
      </div>
    );
  }

  const waiting = left > 0;
  return (
    <button
      type="button"
      disabled={waiting || busy}
      style={{ ...button, marginTop: 12, opacity: waiting || busy ? 0.6 : 1 }}
      onClick={() => setAsking(true)}
    >
      {waiting ? `もう一度分析する（あと ${left} 秒）` : "もう一度分析する"}
    </button>
  );
}
