"use client";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatTime } from "../lib/chart";
import { twitchTimeParam } from "../lib/twitch-time";
import type { PlayerHandle } from "./YoutubePlayer";

type TwitchPlayerApi = {
  seek(sec: number): void;
  play(): void;
  getCurrentTime(): number;
  addEventListener(event: string, cb: () => void): void;
  destroy?: () => void;
};
type TwitchApi = {
  Player: {
    new (
      el: HTMLElement,
      opts: {
        video: string;
        parent: string[];
        autoplay: boolean;
        width: string;
        height: string;
      },
    ): TwitchPlayerApi;
    READY: string;
    PLAYBACK_BLOCKED: string;
  };
};
declare global {
  interface Window {
    Twitch?: TwitchApi;
  }
}

const READY_TIMEOUT_MS = 15000;

let apiPromise: Promise<TwitchApi> | null = null;
function loadApi(): Promise<TwitchApi> {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  apiPromise ??= new Promise<TwitchApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://embed.twitch.tv/embed/v1.js";
    s.onload = () => (window.Twitch ? resolve(window.Twitch) : reject(new Error("load")));
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Twitch の埋め込みプレイヤー。準備前に seek されたら、準備ができてからその時刻で再生する。 */
export function TwitchPlayer({ videoId, ref }: { videoId: string; ref?: Ref<PlayerHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<TwitchPlayerApi | null>(null);
  const pending = useRef<number | null>(null);
  const lastSecRef = useRef(0);
  const [lastSec, setLastSec] = useState(0);
  // failed: 読み込めない。blocked: 自動再生を止められた（再生ボタンを押せば動く）。
  const [problem, setProblem] = useState<"failed" | "blocked" | null>(null);

  useImperativeHandle(ref, () => ({
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
        player.current.seek(sec);
        player.current.play();
      } else pending.current = sec;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let ready = false;
    setProblem(null);
    const timer = setTimeout(() => {
      if (!ready && !cancelled) setProblem("failed");
    }, READY_TIMEOUT_MS);
    loadApi()
      .then((Twitch) => {
        if (cancelled || !host.current) return;
        const target = document.createElement("div");
        host.current.replaceChildren(target);
        const p = new Twitch.Player(target, {
          video: videoId,
          parent: [window.location.hostname],
          autoplay: false,
          width: "100%",
          height: "100%",
        });
        p.addEventListener(Twitch.Player.READY, () => {
          ready = true;
          player.current = p;
          if (pending.current !== null) {
            p.seek(pending.current);
            p.play();
            pending.current = null;
          }
        });
        p.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => setProblem("blocked"));
      })
      .catch(() => setProblem("failed"));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      player.current?.destroy?.();
      player.current = null;
    };
  }, [videoId]);

  const openUrl = `https://www.twitch.tv/videos/${videoId}?t=${twitchTimeParam(lastSec)}`;
  return (
    <div style={{ position: "relative", aspectRatio: "16 / 9", background: "var(--surface-2)" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} className="yt-host" />
      {problem && (
        <div
          role="status"
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
            background: problem === "failed" ? "var(--surface-2)" : "transparent",
            pointerEvents: problem === "failed" ? "auto" : "none",
          }}
        >
          <p
            style={{
              margin: 0,
              padding: problem === "blocked" ? "4px 8px" : 0,
              background: problem === "blocked" ? "var(--surface)" : "transparent",
              borderRadius: "var(--radius)",
            }}
          >
            {problem === "failed"
              ? "⚠ 動画を読み込めませんでした。"
              : "⚠ 自動再生が止められました。プレイヤーの再生ボタンを押してください。"}
          </p>
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--accent-dark)",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              pointerEvents: "auto",
              background: problem === "blocked" ? "var(--surface)" : "transparent",
              padding: problem === "blocked" ? "0 8px" : 0,
              borderRadius: "var(--radius)",
            }}
          >
            Twitch で開く（{formatTime(lastSec)}）
          </a>
        </div>
      )}
    </div>
  );
}
