"use client";
import { useEffect, useRef, useState } from "react";
import { formatStamp, insertAt, MEMO_MAX, memoKey, splitMemo } from "../lib/memo";

const SAVE_MS = 500;
const btn = {
  minHeight: 44,
  padding: "0 16px",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  font: "inherit",
  color: "var(--text)",
  cursor: "pointer",
} as const;

/** 動画ごとのメモ（ブラウザに保存）。時刻 [m:ss] を押すとその時刻から再生する。 */
export function MemoPanel({
  jobId,
  getTime,
  onSeek,
  onError,
}: {
  jobId: string;
  getTime: () => number;
  onSeek: (sec: number) => void;
  onError: (message: string) => void;
}) {
  const [memo, setMemo] = useState("");
  const [loaded, setLoaded] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const warned = useRef(false);

  useEffect(() => {
    setLoaded(false);
    try {
      setMemo(localStorage.getItem(memoKey(jobId)) ?? "");
    } catch {
      setMemo("");
    }
    setLoaded(true);
  }, [jobId]);

  // 入力が止まってから保存する。読み込み前の空の値で上書きしない。
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        if (memo === "") localStorage.removeItem(memoKey(jobId));
        else localStorage.setItem(memoKey(jobId), memo);
        warned.current = false;
      } catch {
        if (!warned.current) onError("メモをこのブラウザに保存できませんでした。");
        warned.current = true;
      }
    }, SAVE_MS);
    return () => clearTimeout(t);
  }, [memo, loaded, jobId, onError]);

  const stamp = () => {
    const el = area.current;
    const focused = el !== null && document.activeElement === el;
    const sel = focused && el ? { start: el.selectionStart, end: el.selectionEnd } : null;
    const r = insertAt(memo, formatStamp(getTime()), sel);
    setMemo(r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.caret, r.caret);
    });
  };

  const parts = splitMemo(memo);
  const left = MEMO_MAX - memo.length;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}
      className="memo-panel"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={btn} onClick={stamp}>
          今の再生位置を差し込む
        </button>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {left < 1000 ? `残り ${left.toLocaleString("ja-JP")} 文字` : ""}
        </span>
      </div>
      <textarea
        ref={area}
        aria-label="メモ"
        value={memo}
        maxLength={MEMO_MAX}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="気になった場面をメモできます"
        style={{
          width: "100%",
          minHeight: 160,
          resize: "vertical",
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
          color: "var(--text)",
          font: "inherit",
          boxSizing: "border-box",
        }}
      />
      <div style={{ overflowY: "auto", minHeight: 0, flex: 1, maxHeight: "40vh" }}>
        <p style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: 13 }}>プレビュー</p>
        {memo === "" ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            メモはまだありません。気になった場面で時刻を差し込んで残せます
          </p>
        ) : (
          <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {parts.map((p, i) =>
              p.sec !== undefined ? (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: 並びは入力順で固定
                  key={i}
                  type="button"
                  onClick={() => onSeek(p.sec as number)}
                  style={{
                    // 文中でも押せる範囲は高さ・幅とも 44px（基本 8）。
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    minWidth: 44,
                    verticalAlign: "middle",
                    background: "none",
                    border: 0,
                    padding: "0 2px",
                    font: "inherit",
                    fontWeight: 700,
                    color: "var(--accent-dark)",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {p.text}
                </button>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: 並びは入力順で固定
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
        )}
      </div>
    </div>
  );
}
