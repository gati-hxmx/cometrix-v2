"use client";
import { useEffect, useState } from "react";
import { THEME_KEY, type Theme } from "../lib/theme";

/** ヘッダー右端の、ライト↔ダークの切り替え。選んだ方を localStorage に覚える。 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const dark = theme === "dark";
  const toggle = () => {
    const next: Theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 保存できなくても、その場の切り替えは効く
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: "0 14px",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        background: "var(--surface-2)",
        color: "var(--text)",
        fontSize: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        visibility: theme === null ? "hidden" : "visible",
      }}
    >
      <span aria-hidden>{dark ? "☾" : "☀"}</span>
      {dark ? "ダーク" : "ライト"}
    </button>
  );
}
