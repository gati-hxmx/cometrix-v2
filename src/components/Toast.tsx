"use client";
import { useEffect, useState } from "react";

const DONE_MS = 4000;

/**
 * 画面の下のお知らせ（基本 8-1）。種類は次の3つ。
 * - できませんでした（kind 省略）：赤の !。✕ を押すまで消えない。
 * - できました＋［元に戻す］（onUndo あり）：緑の ✓ とボタン。✕ を押すまで消えない。
 * - できました（kind="done"）：緑の ✓。4秒で消える（マウスを乗せている間・触れている間は消えない）。
 */
export function Toast({
  message,
  onClose,
  kind = "error",
  onUndo,
}: {
  message: string | null;
  onClose: () => void;
  kind?: "error" | "done";
  onUndo?: () => void;
}) {
  const [held, setHeld] = useState(false);
  const autoClose = kind === "done" && !onUndo;
  useEffect(() => {
    if (!message || !autoClose || held) return;
    const t = setTimeout(onClose, DONE_MS);
    return () => clearTimeout(t);
  }, [message, autoClose, held, onClose]);

  if (!message) return null;
  const done = kind === "done";
  return (
    <div
      role={done ? "status" : "alert"}
      className={done ? "toast toast-done" : "toast"}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      <p>
        {done ? "✓" : "!"} {message}
      </p>
      {onUndo && (
        <button type="button" className="toast-undo" onClick={onUndo}>
          元に戻す
        </button>
      )}
      <button type="button" aria-label="お知らせを閉じる" title="閉じる" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
