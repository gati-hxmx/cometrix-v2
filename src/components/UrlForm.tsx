"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseVideoUrl } from "../lib/youtube-url";
import { Toast } from "./Toast";

const MESSAGES = {
  invalid_url: "YouTube の配信の URL を入れてください。",
  unsupported_url: "Twitch にはまだ対応していません。",
} as const;

/** URL を入れて分析を始める入力欄。トップと分析画面（PC）で共通。 */
export function UrlForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const trimmed = value.trim();
  const parsed = trimmed ? parseVideoUrl(trimmed) : null;
  const problem = parsed && !parsed.ok ? MESSAGES[parsed.code] : null;
  const canSubmit = parsed?.ok === true && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        error?: { message?: string };
      } | null;
      if (res.ok && body?.id) {
        router.push(`/analysis/${body.id}`);
        return;
      }
      setToast(body?.error?.message ?? "分析を始められませんでした。もう一度お試しください。");
    } catch {
      setToast("通信できませんでした。もう一度お試しください。");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="url"
          name="url"
          aria-label="配信の URL"
          aria-invalid={problem ? true : undefined}
          placeholder="https://www.youtube.com/watch?v=..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: トップは入力が唯一の目的
          autoFocus={autoFocus}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            padding: "0 12px",
            border: `1px solid ${problem ? "var(--warn-line)" : "var(--line)"}`,
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy}
          style={{
            minWidth: 44,
            minHeight: 44,
            padding: "0 18px",
            border: 0,
            borderRadius: "var(--radius)",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 16,
            opacity: canSubmit || busy ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "分析中…" : "分析"}
        </button>
      </div>
      {problem ? (
        <p role="status" style={{ margin: "8px 0 0", color: "var(--warn)" }}>
          ⚠ {problem}
        </p>
      ) : (
        <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
          例：https://www.youtube.com/watch?v=… （YouTube の配信アーカイブ）
        </p>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </form>
  );
}
