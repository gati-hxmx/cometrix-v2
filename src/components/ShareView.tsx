"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bucket } from "../lib/chart";
import { LEAD_DEFAULT, leadTarget } from "../lib/lead";
import { sharePath } from "../lib/share-url";
import { BucketChart } from "./BucketChart";
import { Icon } from "./Icon";
import { Player } from "./Player";
import { Toast } from "./Toast";
import { TocPanel } from "./TocPanel";
import type { PlayerHandle } from "./YoutubePlayer";

const card = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 16,
} as const;

/**
 * 共有ページ（#68、docs/screens/share.md）。読むだけ：動画・グラフ・目次。
 * コメントの本文・名前・メモは出さない。t があればその時刻から再生する。
 */
export function ShareView({
  token,
  title,
  platform,
  videoId,
  totalComments,
  buckets,
  startSec,
}: {
  token: string;
  title: string;
  platform: "youtube" | "twitch";
  videoId: string;
  totalComments: number;
  buckets: Bucket[];
  startSec: number | null;
}) {
  const player = useRef<PlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; kind: "done" | "error" } | null>(null);
  const getTime = useCallback(() => player.current?.getTime() ?? 0, []);

  useEffect(() => {
    if (startSec !== null) player.current?.seek(startSec);
  }, [startSec]);

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    const box = playerBox.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight)
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);
  // 棒・目次を押したら、山の少し前から（分析画面の初期値と同じ）
  const seekPeak = useCallback((sec: number) => seek(leadTarget(sec, LEAD_DEFAULT)), [seek]);

  const copyHere = async () => {
    const url = new URL(sharePath(token, getTime()), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "今の時刻のリンクをコピーしました。", kind: "done" });
    } catch {
      setToast({ message: "コピーできませんでした。", kind: "error" });
    }
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 32px" }}>
      <div className="analysis-grid">
        <div className="analysis-main">
          <section style={{ ...card, marginTop: 16 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 4px", overflowWrap: "anywhere" }}>{title}</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              コメント {totalComments.toLocaleString("ja-JP")} 件の盛り上がり
            </p>
          </section>
          <div ref={playerBox} style={{ marginTop: 16, scrollMarginTop: 8 }}>
            <Player ref={player} platform={platform} videoId={videoId} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={copyHere}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                padding: "0 14px",
                font: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                color: "var(--text)",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
              }}
            >
              <Icon name="link" />
              今の時刻のリンクをコピー
            </button>
          </div>
          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>コメント数（30秒ごと）</h2>
            <BucketChart buckets={buckets} onSeek={seekPeak} getTime={getTime} />
          </section>
        </div>
        <aside style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>盛り上がった時刻</h2>
          <TocPanel buckets={buckets} laugh={false} getTime={getTime} onSeek={seekPeak} />
        </aside>
      </div>
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </main>
  );
}
