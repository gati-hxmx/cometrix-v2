"use client";
import type { Ref } from "react";
import { TwitchPlayer } from "./TwitchPlayer";
import { type PlayerHandle, YoutubePlayer } from "./YoutubePlayer";

/** 配信元に合ったプレイヤー。どちらも同じ PlayerHandle（seek・getTime）を持つ。分析画面と共有ページで使う。 */
export function Player({
  platform,
  videoId,
  ref,
}: {
  platform?: "youtube" | "twitch";
  videoId: string;
  ref: Ref<PlayerHandle>;
}) {
  return platform === "twitch" ? (
    <TwitchPlayer ref={ref} videoId={videoId} />
  ) : (
    <YoutubePlayer ref={ref} videoId={videoId} />
  );
}
