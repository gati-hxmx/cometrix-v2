"use client";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatTime } from "../lib/chart";
import { ResumeButton } from "./ResumeButton";

type YTPlayer = {
  seekTo(sec: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  /** 1 が再生中 */
  getPlayerState(): number;
  getCurrentTime(): number;
  destroy(): void;
};
type YTApi = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number>;
      events: { onReady: () => void; onError: () => void; onAutoplayBlocked?: () => void };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type PlayerHandle = {
  seek(sec: number): void;
  getTime(): number;
  /** 再生中なら止め、止まっていれば再生する（キー操作のスペース、#66）。 */
  togglePlay(): void;
  /** 止める（再生中でなければ何もしない） */
  pause(): void;
  /** 動画の最後まで来て止まっているか */
  isEnded(): boolean;
};

let apiPromise: Promise<YTApi> | null = null;
function loadApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTApi>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** YouTube の埋め込みプレイヤー。準備前に seek されたら、準備ができてからその時刻で再生する。 */
export function YoutubePlayer({ videoId, ref }: { videoId: string; ref?: Ref<PlayerHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const pending = useRef<number | null>(null);
  const [lastSec, setLastSec] = useState(0);
  const lastSecRef = useRef(0);
  const [failed, setFailed] = useState(false);
  // 自動再生を止められた。ボタンを押す（ユーザー操作）で、最後に押した時刻から再生する。
  const [blocked, setBlocked] = useState(false);

  useImperativeHandle(ref, () => ({
    pause() {
      try {
        player.current?.pauseVideo();
      } catch {}
    },
    isEnded() {
      try {
        return player.current?.getPlayerState() === 0;
      } catch {
        return false;
      }
    },
    togglePlay() {
      const p = player.current;
      if (!p) return;
      try {
        // 1 再生中・3 読み込み中（前後へ動いた直後）はどちらも止める
        const st = p.getPlayerState();
        if (st === 1 || st === 3) p.pauseVideo();
        else p.playVideo();
      } catch {
        // 準備ができていないときは何もしない
      }
    },
    getTime() {
      try {
        return player.current?.getCurrentTime() ?? pending.current ?? lastSecRef.current;
      } catch {
        return lastSecRef.current;
      }
    },
    seek(sec: number) {
      setLastSec(sec);
      lastSecRef.current = sec;
      if (player.current) {
        player.current.seekTo(sec, true);
        player.current.playVideo();
      } else pending.current = sec;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setBlocked(false);
    loadApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const target = document.createElement("div");
        host.current.replaceChildren(target);
        const p = new YT.Player(target, {
          videoId,
          playerVars: { rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              player.current = p;
              if (pending.current !== null) {
                p.seekTo(pending.current, true);
                p.playVideo();
                pending.current = null;
              }
            },
            onError: () => setFailed(true),
            onAutoplayBlocked: () => setBlocked(true),
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  return (
    <div style={{ position: "relative", aspectRatio: "16 / 9", background: "var(--surface-2)" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} className="yt-host" />
      {blocked && !failed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto", maxWidth: "100%" }}>
            <ResumeButton
              sec={lastSec}
              onPlay={() => {
                const p = player.current;
                if (p) {
                  p.seekTo(lastSecRef.current, true);
                  p.playVideo();
                }
                setBlocked(false);
              }}
            />
          </div>
        </div>
      )}
      {failed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 16,
            textAlign: "center",
            background: "var(--surface-2)",
          }}
        >
          <p style={{ margin: 0 }}>⚠ 動画を読み込めませんでした。</p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(lastSec)}s`}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--accent-dark)",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            YouTube で開く（{formatTime(lastSec)}）
          </a>
        </div>
      )}
    </div>
  );
}
