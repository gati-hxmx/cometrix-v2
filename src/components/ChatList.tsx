"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/chart";
import { nearestIndex } from "../lib/chat-filter";

export type Filter = { q: string; user: string };
type Msg = { id: number; offsetMs: number; author: string; body: string };

const LIMIT = 100;
const EDGE = 15;
const FOLLOW_MS = 1000;
const DEBOUNCE_MS = 300;

const input = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: "0 10px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
} as const;

/**
 * チャット一覧（絞り込み欄つき）。再生位置に近いコメントを出して追従する。
 * 絞り込み（300ms 待ち）は onFilter でグラフ側にも渡す。
 */
export function ChatList({
  jobId,
  getTime,
  onSeek,
  onFilter,
  onError,
}: {
  jobId: string;
  getTime: () => number;
  onSeek: (sec: number) => void;
  onFilter: (f: Filter) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Filter>({ q: "", user: "" });
  const [applied, setApplied] = useState<Filter>({ q: "", user: "" });
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [follow, setFollow] = useState(true);
  const fetchedAround = useRef(0);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const nowRef = useRef(0);
  const msgsRef = useRef<Msg[] | null>(null);
  msgsRef.current = msgs;

  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft]);
  useEffect(() => {
    onFilter(applied);
  }, [applied, onFilter]);

  const load = useCallback(
    async (around: number) => {
      const my = ++seq.current;
      const p = new URLSearchParams({
        aroundSec: String(Math.floor(around)),
        limit: String(LIMIT),
      });
      if (applied.q.trim()) p.set("q", applied.q);
      if (applied.user.trim()) p.set("user", applied.user);
      try {
        const res = await fetch(`/api/jobs/${jobId}/messages?${p}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as Msg[];
        if (my !== seq.current) return;
        fetchedAround.current = around;
        setFailed(false);
        setMsgs(rows);
      } catch {
        if (my !== seq.current) return;
        setFailed(true);
        onError("チャットを読み込めませんでした。");
      }
    },
    [jobId, applied, onError],
  );

  // 絞り込みが変わったら、今の再生位置から取り直す。
  useEffect(() => {
    setMsgs(null);
    nowRef.current = getTime();
    setNow(nowRef.current);
    load(nowRef.current);
  }, [load, getTime]);

  // 約1秒ごとに現在位置を読み、取得済みの範囲の端に近づいたら取り直す。
  useEffect(() => {
    const timer = setInterval(() => {
      const t = getTime();
      nowRef.current = t;
      setNow(t);
      const rows = msgsRef.current;
      if (!rows || rows.length < LIMIT) return;
      const i = nearestIndex(
        rows.map((r) => r.offsetMs),
        t,
      );
      const nearEdge = i < EDGE || i >= rows.length - EDGE;
      const outside = t * 1000 < rows[0].offsetMs || t * 1000 > rows[rows.length - 1].offsetMs;
      if ((outside || nearEdge) && Math.abs(t - fetchedAround.current) >= 5) load(t);
    }, FOLLOW_MS);
    return () => clearInterval(timer);
  }, [getTime, load]);

  const active = msgs
    ? nearestIndex(
        msgs.map((m) => m.offsetMs),
        now,
      )
    : -1;
  const activeId = active >= 0 && msgs ? msgs[active].id : null;

  // 追従：一覧の枠の中だけを動かす（ページ全体はスクロールしない）。
  useEffect(() => {
    if (!follow || activeId === null) return;
    const list = listRef.current;
    const row = rowRefs.current.get(activeId);
    if (!list || !row) return;
    list.scrollTop = row.offsetTop - list.offsetTop - list.clientHeight / 2 + row.clientHeight / 2;
  }, [follow, activeId]);

  const filtering = applied.q.trim() !== "" || applied.user.trim() !== "";

  return (
    <section className="chat-list" aria-label="チャット">
      <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>チャット</h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted)" }}>
          キーワード
          <input
            type="search"
            maxLength={100}
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            style={input}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted)" }}>
          ユーザー名
          <input
            type="search"
            maxLength={100}
            value={draft.user}
            onChange={(e) => setDraft({ ...draft, user: e.target.value })}
            style={input}
          />
        </label>
        {(draft.q !== "" || draft.user !== "") && (
          <button
            type="button"
            onClick={() => setDraft({ q: "", user: "" })}
            style={{
              minHeight: 44,
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            クリア
          </button>
        )}
      </div>
      <p aria-live="polite" style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
        {msgs && filtering
          ? msgs.length === 0
            ? "一致するコメントがありません"
            : `一致するコメントを表示中（近い ${msgs.length} 件まで）`
          : ""}
      </p>
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        {failed ? (
          <div style={{ padding: 16, textAlign: "center", width: "100%" }}>
            <p style={{ margin: "0 0 8px" }}>⚠ チャットを読み込めませんでした。</p>
            <button
              type="button"
              onClick={() => load(getTime())}
              style={{ minHeight: 44, padding: "0 16px", cursor: "pointer" }}
            >
              再読み込み
            </button>
          </div>
        ) : msgs === null ? (
          <div
            aria-hidden
            style={{ flex: 1, minHeight: 200, background: "var(--surface-2)", borderRadius: 6 }}
          />
        ) : msgs.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "24px 0",
              textAlign: "center",
              color: "var(--muted)",
              width: "100%",
            }}
          >
            {filtering ? "一致するコメントがありません" : "コメントがありません"}
          </p>
        ) : (
          <ul
            ref={listRef}
            onWheel={() => setFollow(false)}
            onTouchMove={() => setFollow(false)}
            className="chat-scroll"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              overflowY: "auto",
              flex: 1,
              position: "relative",
            }}
          >
            {msgs.map((m) => (
              <li
                key={m.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(m.id, el);
                  else rowRefs.current.delete(m.id);
                }}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  padding: "2px 6px",
                  borderRadius: 6,
                  background: m.id === activeId ? "var(--surface-2)" : "transparent",
                  fontSize: 14,
                  overflowWrap: "anywhere",
                }}
              >
                <button
                  type="button"
                  onClick={() => onSeek(m.offsetMs / 1000)}
                  style={{
                    flex: "0 0 auto",
                    minHeight: 44,
                    minWidth: 56,
                    padding: 0,
                    border: 0,
                    background: "none",
                    color: "var(--accent-dark)",
                    fontWeight: 700,
                    font: "inherit",
                    fontVariantNumeric: "tabular-nums",
                    cursor: "pointer",
                  }}
                >
                  {formatTime(m.offsetMs / 1000)}
                </button>
                <span style={{ color: "var(--muted)", flex: "0 0 auto", maxWidth: "35%" }}>
                  {m.author}
                </span>
                <span>{m.body}</span>
              </li>
            ))}
          </ul>
        )}
        {!follow && msgs && msgs.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFollow(true);
              load(getTime());
            }}
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 22,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--accent-dark)",
              cursor: "pointer",
            }}
          >
            再生位置に戻る
          </button>
        )}
      </div>
    </section>
  );
}
