"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/chart";
import {
  addRegex,
  addTerm,
  EMPTY_FILTER,
  type FILTER_KEYS,
  type Filter,
  filterParams,
  isFiltering,
  MAX_TERM,
  MAX_TERMS,
  nearestIndex,
} from "../lib/chat-filter";

export type { Filter };

type Msg = { id: number; offsetMs: number; author: string; body: string };

const LIMIT = 100;
const EDGE = 15;
const FOLLOW_MS = 1000;

const FIELDS: {
  key: (typeof FILTER_KEYS)[number];
  label: string;
  exclude: boolean;
  regex?: boolean;
}[] = [
  { key: "q", label: "含めるワード", exclude: false },
  { key: "xq", label: "除外するワード", exclude: true },
  { key: "user", label: "含めるユーザー", exclude: false },
  { key: "xuser", label: "除外するユーザー", exclude: true },
  { key: "re", label: "含める形（正規表現）", exclude: false, regex: true },
  { key: "xre", label: "除外する形（正規表現）", exclude: true, regex: true },
];

/** 正規表現を打たなくても入れられる、よく使う形（押すと入力欄に入る。追加するまで反映しない）。 */
const PRESETS = [
  { name: "数字だけ", pattern: "^[0-9]+$" },
  { name: "URL", pattern: "https?://" },
  { name: "1文字", pattern: "^.$" },
  { name: "!コマンド", pattern: "^!" },
  { name: "同じ字の繰り返し", pattern: "(.)\\1{3,}" },
] as const;

const REASON = {
  empty: "語を入力してください",
  duplicate: "すでに追加しています",
  full: `1種類に入れられるのは ${MAX_TERMS} 語までです`,
  long: `${MAX_TERM} 文字までです`,
  invalid: "正規表現として読めません",
} as const;

/** 語を追加してチップで並べる欄。追加・削除はすぐ反映する（入力途中は反映しない）。 */
function TermField({
  label,
  exclude,
  regex = false,
  terms,
  onChange,
}: {
  label: string;
  exclude: boolean;
  regex?: boolean;
  terms: string[];
  onChange: (list: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = terms.length >= MAX_TERMS;
  const add = () => {
    const r = (regex ? addRegex : addTerm)(terms, text);
    if (!r.ok) {
      setError(REASON[r.reason]);
      return;
    }
    setError(null);
    setText("");
    onChange(r.list);
  };
  const tone = exclude ? "var(--danger)" : "var(--accent-dark)";
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted)" }}>
      <label htmlFor={`f-${label}`}>{label}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id={`f-${label}`}
          type="text"
          maxLength={MAX_TERM}
          value={text}
          disabled={full}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          style={{ ...input, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={add}
          disabled={full || text.trim() === ""}
          style={{
            minHeight: 44,
            minWidth: 56,
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          追加
        </button>
      </div>
      {regex && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.pattern}
              disabled={full}
              onClick={() => {
                setText(p.pattern);
                setError(null);
              }}
              style={{
                minHeight: 44,
                padding: "0 12px",
                border: "1px solid var(--line)",
                borderRadius: 16,
                background: "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {(error || full) && <span role="alert">{error ?? REASON.full}</span>}
      {terms.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {terms.map((t) => (
            <li
              key={t}
              style={{
                display: "inline-flex",
                alignItems: "center",
                border: `1px solid ${tone}`,
                borderRadius: 16,
                paddingLeft: 10,
                color: tone,
                overflowWrap: "anywhere",
              }}
            >
              {exclude && <span style={{ fontWeight: 700, marginRight: 4 }}>除外</span>}
              {t}
              <button
                type="button"
                aria-label={`${t} を削除`}
                onClick={() => onChange(terms.filter((x) => x !== t))}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  border: 0,
                  background: "none",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
 * 絞り込み（語を追加・削除したとき）は onFilter でグラフ側にも渡す。
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
  const [applied, setApplied] = useState<Filter>(EMPTY_FILTER);
  const [showMore, setShowMore] = useState(false);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;
  const fetchedAround = useRef(0);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const nowRef = useRef(0);
  const msgsRef = useRef<Msg[] | null>(null);
  msgsRef.current = msgs;

  useEffect(() => {
    onFilter(applied);
  }, [applied, onFilter]);

  const load = useCallback(
    async (around: number) => {
      const my = ++seq.current;
      const p = filterParams(applied);
      p.set("aroundSec", String(Math.floor(around)));
      p.set("limit", String(LIMIT));
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
      // 手でスクロールして読んでいる間は取り直さない（「再生位置に戻る」で取り直す）。
      if (!followRef.current || !rows || rows.length < LIMIT) return;
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

  const filtering = isFiltering(applied);
  const usingRegex = applied.re.length > 0 || applied.xre.length > 0;
  const moreOpen = showMore || usingRegex;

  return (
    <section className="chat-list" aria-label="チャット">
      <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>チャット</h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
        {FIELDS.filter((fd) => !fd.regex || moreOpen).map((fd) => (
          <TermField
            key={fd.key}
            label={fd.label}
            exclude={fd.exclude}
            regex={fd.regex}
            terms={applied[fd.key]}
            onChange={(list) => setApplied((cur) => ({ ...cur, [fd.key]: list }))}
          />
        ))}
        {/* 形（正規表現）の欄は使う人が限られるので、ふだんは閉じておく（18項目の1・3）。使っている間は閉じない。 */}
        {!usingRegex && (
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setShowMore((v) => !v)}
            style={{
              justifySelf: "start",
              minHeight: 44,
              padding: "0 12px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {moreOpen ? "▾" : "›"} 形で絞り込む（数字だけ・URL など）
          </button>
        )}
        {filtering && (
          <button
            type="button"
            onClick={() => setApplied(EMPTY_FILTER)}
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
