"use client";
import { useEffect } from "react";

/** 右上のお知らせ（すぐ消える）。基本 8-1。 */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        left: 12,
        maxWidth: 360,
        marginLeft: "auto",
        padding: "12px 14px",
        background: "var(--danger-weak)",
        border: "1px solid var(--danger-line)",
        borderRadius: "var(--radius)",
        color: "var(--danger)",
        zIndex: 20,
      }}
    >
      ⚠ {message}
    </div>
  );
}
