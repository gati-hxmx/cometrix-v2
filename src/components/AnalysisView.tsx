"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bucket } from "../lib/chart";
import { BucketChart } from "./BucketChart";
import { Toast } from "./Toast";
import { UrlForm } from "./UrlForm";
import { type PlayerHandle, YoutubePlayer } from "./YoutubePlayer";

type Job = {
  status: "queued" | "running" | "done" | "failed";
  result?: { videoId: string; title: string; totalComments: number } | null;
  error?: { code: string; message: string } | null;
};
type State =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "job"; job: Job; buckets: Bucket[] | null };

const POLL_MS = 3000;
const card = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 16,
} as const;

/** 分析画面（docs/screens/analysis.md 案 A）。チャット一覧は #5。 */
export function AnalysisView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [toast, setToast] = useState<string | null>(null);
  const player = useRef<PlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    async function tick() {
      let next: number | null = POLL_MS;
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 404) {
          setState({ kind: "notfound" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const job = (await res.json()) as Job;
        let buckets: Bucket[] | null = null;
        if (job.status === "done") {
          const b = await fetch(`/api/jobs/${id}/buckets`, { cache: "no-store" });
          if (!b.ok) throw new Error(String(b.status));
          buckets = (await b.json()) as Bucket[];
          next = null;
        } else if (job.status === "failed") next = null;
        if (stopped) return;
        misses = 0;
        setState({ kind: "job", job, buckets });
      } catch {
        misses += 1;
        if (misses === 3)
          setToast("分析の状態を確かめられません。つながり次第、自動で確かめ直します。");
      }
      if (next !== null && !stopped) timer = setTimeout(tick, next);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    const box = playerBox.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight)
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (state.kind === "notfound") {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px" }}>
        <div style={card}>
          <p style={{ margin: "0 0 12px" }}>分析が見つかりません。</p>
          <Link href="/" style={{ color: "var(--accent-dark)" }}>
            トップへ戻る
          </Link>
        </div>
      </main>
    );
  }

  const job = state.kind === "job" ? state.job : null;
  const done = job?.status === "done" && job.result ? job : null;
  const waiting = !job || job.status === "queued" || job.status === "running";

  return (
    <main className="analysis" style={{ maxWidth: 860, margin: "0 auto", padding: "16px" }}>
      <div className="analysis-url">
        <UrlForm />
      </div>

      {job?.status === "failed" && (
        <div style={{ ...card, marginTop: 16, borderColor: "var(--danger-line)" }}>
          <p style={{ margin: "0 0 8px", color: "var(--danger)", fontWeight: 700 }}>
            ⚠ 分析できませんでした
          </p>
          <p style={{ margin: "0 0 12px" }}>{job.error?.message ?? "原因が分かりません。"}</p>
          <Link href="/" style={{ color: "var(--accent-dark)" }}>
            別の URL で分析し直す
          </Link>
        </div>
      )}

      {job?.status !== "failed" && (
        <>
          <section style={{ ...card, marginTop: 16 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>
              {done?.result?.title ?? (waiting ? "分析中…" : "")}
            </h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {done?.result
                ? `コメント ${done.result.totalComments.toLocaleString("ja-JP")} 件`
                : "チャットを取得して集計しています。数分かかることがあります。"}
            </p>
          </section>

          <div ref={playerBox} style={{ marginTop: 16, scrollMarginTop: 8 }}>
            {done?.result ? (
              <YoutubePlayer ref={player} videoId={done.result.videoId} />
            ) : (
              <div
                aria-hidden
                style={{
                  aspectRatio: "16 / 9",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius)",
                }}
              />
            )}
          </div>

          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>コメント数（30秒ごと）</h2>
            {state.kind === "job" && state.buckets ? (
              <BucketChart buckets={state.buckets} onSeek={seek} />
            ) : (
              <div
                aria-hidden
                style={{ height: 162, background: "var(--surface-2)", borderRadius: 6 }}
              />
            )}
          </section>
        </>
      )}
      <Toast message={toast} onClose={closeToast} />
    </main>
  );
}
