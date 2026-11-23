import { randomBytes } from "node:crypto";

// 共有リンク（#68）。鍵は推測できない長さ（16 バイト＝base64url で 22 文字）にする。

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
