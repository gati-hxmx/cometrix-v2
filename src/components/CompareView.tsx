"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Bucket, formatTime } from "../lib/chart";
import {
  ADJ_LIMIT,
  alignShifts,
  axisLength,
  COMPARE_MAX,
  type CompareParams,
  compareQuery,
  formatShift,
  normalize,
  shiftCounts,
  togetherBands,
  togetherNeed,
  valueText,
  videoSecAt,
} from "../lib/compare";
import { type FetchProgress, progressLabel } from "../lib/progress";
import { parseVideoUrl } from "../lib/youtube-url";
import { CompareChart, type CompareLine } from "./CompareChart";
import { Icon } from "./Icon";
import { Player } from "./Player";
import { Segmented } from "./Segmented";
import { Toast } from "./Toast";
import type { PlayerHandle } from "./YoutubePlayer";

/**
 * コラボを重ねて比べる画面（#63、案 J、docs/screens/compare.md）。
 * 2〜4 本の配信を、配信した時刻で同じ時間軸にそろえて線で重ねる。
 * PC：左に動画とグラフ、右に重ねる配信の一覧。スマホ：1列（動画 → グラフ → 一覧）。
 */

const card = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 16,
} as const;
const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minWidth: 44,
  minHeight: 44,
  padding: "0 12px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  cursor: "pointer",
} as const;
const iconBtn = { ...btn, width: 44, padding: 0, fontSize: 20 } as const;
const COLORS = ["var(--v-1)", "var(--v-2)", "var(--v-3)", "var(--v-4)"];
const MODES = [
  { key: "n", name: "件数" },
  { key: "r", name: "割合" },
] as const;

type Meta = {
  status: "queued" | "running" | "done" | "failed";
  platform?: "youtube" | "twitch";
  videoId: string;
  result: { title?: string; streamedAt?: number } | null;
  progress: FetchProgress | null;
};
type Stream =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "failed"; title: string | null }
  | { kind: "waiting"; progress: FetchProgress | null }
  | { kind: "done"; meta: Meta; counts: number[] };

const POLL_MS = 3000;

export function CompareView({ initial }: { initial: CompareParams }) {
  const [params, setParams] = useState<CompareParams>(initial);
  const [streams, setStreams] = useState<Record<string, Stream>>({});
  // プレイヤーで見ている配信。並びの位置ではなく ID で持つ（前の配信の読み込みが終わっても替わらない）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [mode, setMode] = useState<"n" | "r">("n");
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const notify = useCallback((message: string) => setToast({ message }), []);
  const player = useRef<PlayerHandle>(null);
  const pendingSeek = useRef<number | null>(null);

  // URL を今の並び・ずれにそろえる（再読み込み・共有で同じ画面になる）
  useEffect(() => {
    const q = compareQuery(params);
    const next = params.ids.length > 0 ? `/compare?${q}` : "/compare";
    if (`${location.pathname}${location.search}` !== next) history.replaceState(null, "", next);
  }, [params]);

  // 各配信を読み込む。分析中のものは終わるまで数秒ごとに見に行く
  const idsKey = params.ids.join(",");
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  useEffect(() => {
    let stop = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const load = async (id: string) => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (stop) return;
        if (res.status === 404) {
          setStreams((s) => ({ ...s, [id]: { kind: "missing" } }));
          return;
        }
        const meta = (await res.json()) as Meta;
        if (stop) return;
        if (meta.status === "failed") {
          setStreams((s) => ({ ...s, [id]: { kind: "failed", title: null } }));
          return;
        }
        if (meta.status !== "done") {
          setStreams((s) => ({ ...s, [id]: { kind: "waiting", progress: meta.progress } }));
          timers.push(setTimeout(() => load(id), POLL_MS));
          return;
        }
        const b = await fetch(`/api/jobs/${id}/buckets`, { cache: "no-store" });
        if (stop) return;
        if (!b.ok) throw new Error("buckets");
        const rows = (await b.json()) as Bucket[];
        if (stop) return;
        setStreams((s) => ({
          ...s,
          [id]: { kind: "done", meta, counts: rows.map((r) => r.count) },
        }));
      } catch {
        if (stop) return;
        // 通信の失敗はしばらくして読み直す
        timers.push(setTimeout(() => load(id), POLL_MS * 2));
      }
    };
    // 読み込み済み（終わった・見つからない・失敗）の配信は、足す・外すたびに読み直さない
    for (const id of idsKey ? idsKey.split(",") : []) {
      const k = streamsRef.current[id]?.kind;
      if (k !== "done" && k !== "missing" && k !== "failed") load(id);
    }
    return () => {
      stop = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [idsKey]);

  // 線に描ける（分析が終わった）配信だけを、URL の並びのまま
  const ready = useMemo(
    () =>
      params.ids.flatMap((id, i) => {
        const s = streams[id];
        return s?.kind === "done" ? [{ id, index: i, meta: s.meta, counts: s.counts }] : [];
      }),
    [params.ids, streams],
  );
  const { shifts, unknown } = useMemo(
    () =>
      alignShifts(
        ready.map((r) => r.meta.result?.streamedAt),
        ready.map((r) => params.adj[r.index] ?? 0),
      ),
    [ready, params.adj],
  );
  const n = axisLength(
    ready.map((r) => r.counts.length),
    shifts,
  );
  const raw = useMemo(
    () => ready.map((r, j) => shiftCounts(r.counts, shifts[j], n)),
    [ready, shifts, n],
  );
  const bands = useMemo(() => togetherBands(raw), [raw]);
  const ratio = mode === "r";
  const lines: CompareLine[] = ready.map((r, j) => ({
    key: r.id,
    name: titleOf(r.meta),
    color: COLORS[r.index % COLORS.length],
    values: ratio ? normalize(raw[j]) : raw[j],
  }));
  const sel = Math.max(
    0,
    ready.findIndex((r) => r.id === selectedId),
  );
  const current = ready[sel];

  // 選んだ配信を、縦線の時刻から再生する
  const playAt = useCallback(
    (j: number, k: number | null) => {
      const r = ready[j];
      if (!r) return;
      if (k === null) return;
      const t = videoSecAt(k * 30, shifts[j], r.counts.length * 30);
      if (t === null) {
        notify(`${titleOf(r.meta)} はこの時刻に配信していません`);
        return;
      }
      if (j !== sel) {
        pendingSeek.current = t;
        setSelectedId(r.id);
      } else player.current?.seek(t);
    },
    [ready, shifts, sel, notify],
  );
  // 配信を切り替えたら、新しいプレイヤーに時刻を渡す（準備前の seek は準備後に効く）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 動画が替わったときだけ
  useEffect(() => {
    if (pendingSeek.current === null) return;
    const t = pendingSeek.current;
    pendingSeek.current = null;
    player.current?.seek(t);
  }, [current?.id]);

  const switchTo = (j: number) => {
    if (cursor !== null) {
      const r = ready[j];
      const t = r ? videoSecAt(cursor * 30, shifts[j], r.counts.length * 30) : null;
      if (t !== null) pendingSeek.current = t;
    }
    setSelectedId(ready[j]?.id ?? null);
  };

  const adjust = (index: number, delta: number) =>
    setParams((p) => ({
      ...p,
      adj: p.adj.map((a, i) =>
        i === index ? Math.max(-ADJ_LIMIT, Math.min(ADJ_LIMIT, a + delta)) : a,
      ),
    }));
  // 外したら、お知らせの［元に戻す］で同じ位置・同じずれに戻せる（確かめのダイアログは出さない）
  const remove = (index: number) => {
    const before = params;
    const id = params.ids[index];
    const s = streams[id];
    setParams((p) => ({
      ids: p.ids.filter((_, i) => i !== index),
      adj: p.adj.filter((_, i) => i !== index),
    }));
    if (id === selectedId) setSelectedId(null);
    // 軸の長さや基準が変わるので、縦線は消す
    setCursor(null);
    setToast({
      message: `${s?.kind === "done" ? titleOf(s.meta) : "配信"} を外しました`,
      undo: () => {
        setParams(before);
        setCursor(null);
        setToast(null);
      },
    });
  };
  const add = (id: string) => {
    if (params.ids.includes(id)) {
      notify("その配信はもう重ねています");
      return;
    }
    setParams((p) =>
      p.ids.includes(id) || p.ids.length >= COMPARE_MAX
        ? p
        : { ids: [...p.ids, id], adj: [...p.adj, 0] },
    );
  };

  const first = ready
    .map((r) => r.meta.result?.streamedAt)
    .filter((s): s is number => typeof s === "number");
  const startText =
    first.length > 0
      ? new Date(Math.min(...first) * 1000).toLocaleString("ja-JP", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const need = togetherNeed(ready.length);
  const anyUnknown = unknown.some(Boolean) && ready.length >= 2;

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: 16 }}>
      <div className="compare-grid">
        <div className="compare-main">
          <section style={{ ...card, marginTop: 16 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>コラボを重ねて比べる</h1>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
              {params.ids.length} 本{startText ? `・最初の開始 ${startText}` : ""}
            </p>
          </section>

          {current && (
            <>
              <StreamPicker
                names={ready.map((r) => titleOf(r.meta))}
                colors={ready.map((r) => COLORS[r.index % COLORS.length])}
                value={sel}
                onChange={switchTo}
              />
              <div style={{ marginTop: 8 }}>
                <Player
                  key={current.id}
                  ref={player}
                  platform={current.meta.platform}
                  videoId={current.meta.videoId}
                />
              </div>
            </>
          )}

          <section style={{ ...card, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                {ratio ? "盛り上がりの割合" : "コメント数"}
                <span className="compare-head-note" style={{ fontWeight: 400 }}>
                  {ratio ? "（各配信の最大を 100%）" : "（30秒ごと）"}
                </span>
              </h2>
              <Segmented label="数の見せ方" options={MODES} value={mode} onChange={setMode} />
            </div>
            {ready.length < 2 ? (
              <p style={{ margin: "12px 0 0", color: "var(--muted)" }}>
                {params.ids.length < 2
                  ? "重ねる配信を 2 本以上にしてください（PC は右、スマホは下の一覧から足せます）。"
                  : "分析が終わった配信が 2 本そろうと、ここに重ねて出します。"}
              </p>
            ) : (
              <>
                <CompareChart
                  lines={lines}
                  bands={bands}
                  ratio={ratio}
                  cursor={cursor}
                  focus={sel}
                  label="重ねたグラフ。左右のキーで時刻を選び、Enter で再生"
                  onCursor={(k, play) => {
                    setCursor(k);
                    if (play) playAt(sel, k);
                  }}
                />
                <p
                  aria-live="polite"
                  style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}
                >
                  {cursor === null
                    ? "グラフを押すと、その時刻の数を出して再生します"
                    : `${formatTime(cursor * 30)} の数（札を押すとその配信を再生）`}
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {ready.map((r, j) => (
                    <li key={r.id} style={{ maxWidth: "100%" }}>
                      <button
                        type="button"
                        aria-pressed={j === sel}
                        onClick={() => {
                          if (cursor === null) switchTo(j);
                          else playAt(j, cursor);
                        }}
                        style={{
                          ...btn,
                          maxWidth: "100%",
                          borderRadius: 999,
                          background: j === sel ? "var(--accent-weak)" : "var(--surface)",
                          borderColor: j === sel ? "var(--accent-line)" : "var(--line)",
                        }}
                      >
                        <Dot color={COLORS[r.index % COLORS.length]} />
                        <span
                          style={{
                            minWidth: 0,
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={titleOf(r.meta)}
                        >
                          {titleOf(r.meta)}
                        </span>
                        {cursor !== null && (
                          <strong
                            className="compare-chip-count"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {valueText(lines[j].values[cursor] ?? null, ratio)}
                          </strong>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  薄い青の帯：{need} 本以上が同時に盛り上がった所
                </p>
                {anyUnknown && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--warn)" }}>
                    ⚠ 開始の時刻がわからない配信は、最初の配信の開始に合わせました。− ＋ で直せます
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <aside style={{ ...card, marginTop: 16 }} className="compare-side">
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>
            重ねる配信（{params.ids.length} / {COMPARE_MAX}）
          </h2>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
            開始の時刻を自動で合わせました。ずれていたら − ＋ で直せます（1 回 1 秒）
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {params.ids.map((id, i) => {
              const s = streams[id] ?? { kind: "loading" };
              const j = ready.findIndex((r) => r.id === id);
              return (
                <li
                  key={id}
                  style={{
                    borderTop: i === 0 ? 0 : "1px solid var(--line)",
                    padding: "4px 0 8px",
                  }}
                >
                  {/* 1行目：名前（押すとその配信の分析画面）。2行目：開始のずれの − ＋ と［外す］ */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                    <Dot color={COLORS[i % COLORS.length]} size={12} />
                    {s.kind === "done" ? (
                      <Link
                        href={`/analysis/${id}`}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          fontWeight: 700,
                          color: "var(--text)",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {titleOf(s.meta)}
                        </span>
                      </Link>
                    ) : (
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color:
                            s.kind === "missing" || s.kind === "failed"
                              ? "var(--danger)"
                              : "var(--muted)",
                        }}
                      >
                        {s.kind === "loading"
                          ? "読み込み中…"
                          : s.kind === "waiting"
                            ? s.progress
                              ? `分析中・${progressLabel(s.progress)}`
                              : "分析を待っています…"
                            : s.kind === "missing"
                              ? "⚠ 見つかりません"
                              : "⚠ 分析できませんでした"}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 20 }}>
                    {s.kind === "done" && j >= 0 && (
                      <>
                        <span style={{ fontSize: 13, color: "var(--muted)", marginRight: 4 }}>
                          開始
                        </span>
                        <button
                          type="button"
                          aria-label={`${titleOf(s.meta)} を 1 秒早める`}
                          onClick={() => adjust(i, -1)}
                          style={iconBtn}
                        >
                          −
                        </button>
                        <span
                          style={{
                            minWidth: 56,
                            textAlign: "center",
                            fontSize: 14,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatShift(shifts[j])}
                        </span>
                        <button
                          type="button"
                          aria-label={`${titleOf(s.meta)} を 1 秒遅らせる`}
                          onClick={() => adjust(i, 1)}
                          style={iconBtn}
                        >
                          ＋
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`${s.kind === "done" ? titleOf(s.meta) : "この配信"} を外す`}
                      onClick={() => remove(i)}
                      style={{ ...btn, marginLeft: "auto" }}
                    >
                      外す
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {params.ids.length < COMPARE_MAX && <AddStream onAdd={add} onError={notify} />}
        </aside>
      </div>
      <Toast
        message={toast?.message ?? null}
        kind={toast?.undo ? "done" : undefined}
        onUndo={toast?.undo}
        onClose={() => setToast(null)}
      />
    </main>
  );
}

function titleOf(m: Meta): string {
  return m.result?.title || m.videoId;
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ flex: "none", width: size, height: size, borderRadius: 3, background: color }}
    />
  );
}

/** 「‹ 名前 ▾ ›」の1件ずつ切り替え（部品 5-10）。名前 ▾ で小さなメニュー（5-9）から選ぶ */
function StreamPicker({
  names,
  colors,
  value,
  onChange,
}: {
  names: string[];
  colors: string[];
  value: number;
  onChange: (j: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return (
    <div ref={box} style={{ position: "relative", display: "flex", gap: 8, marginTop: 16 }}>
      <button
        type="button"
        aria-label="前の配信"
        disabled={value === 0}
        onClick={() => onChange(value - 1)}
        style={iconBtn}
      >
        ‹
      </button>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`プレイヤーで見る配信：${names[value]}`}
        onClick={() => setOpen((o) => !o)}
        style={{ ...btn, flex: 1, minWidth: 0, justifyContent: "flex-start", fontWeight: 700 }}
      >
        <Dot color={colors[value]} />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {names[value]}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex" }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      <button
        type="button"
        aria-label="次の配信"
        disabled={value >= names.length - 1}
        onClick={() => onChange(value + 1)}
        style={iconBtn}
      >
        ›
      </button>
      {open && (
        <div
          role="menu"
          aria-label="プレイヤーで見る配信"
          className="menu-pop picker-pop"
          onKeyDown={onMenuKey}
          onBlur={(e) => {
            // Tab でメニューの外へ出たら閉じる
            if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          {names.map((name, j) => (
            <button
              key={name + String(j)}
              type="button"
              role="menuitemradio"
              aria-checked={j === value}
              onClick={() => {
                onChange(j);
                setOpen(false);
                trigger.current?.focus();
              }}
              style={{
                ...btn,
                width: "100%",
                minHeight: 48,
                border: 0,
                justifyContent: "flex-start",
                textAlign: "left",
                background: j === value ? "var(--accent-weak)" : "transparent",
              }}
            >
              <Dot color={colors[j]} />
              {/* 長い名前は、メニューの中では省かずに2行まで出す（部品 5-9） */}
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</span>
              <span aria-hidden style={{ width: 20, color: "var(--accent-dark)", fontWeight: 700 }}>
                {j === value ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 一覧の下の「配信を足す」。URL を入れると分析を始め（済んでいればそのまま）、一覧に足す */
function AddStream({
  onAdd,
  onError,
}: {
  onAdd: (id: string) => void;
  onError: (m: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();
  const parsed = trimmed ? parseVideoUrl(trimmed) : null;
  const bad = parsed !== null && !parsed.ok;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.ok || busy) return;
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
        onAdd(body.id);
        setValue("");
      } else onError(body?.error?.message ?? "配信を足せませんでした。もう一度お試しください。");
    } catch {
      onError("通信できませんでした。もう一度お試しください。");
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} noValidate style={{ marginTop: 12 }}>
      <label
        htmlFor="compare-add"
        style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}
      >
        配信を足す（URL）
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="compare-add"
          type="url"
          value={value}
          aria-invalid={bad || undefined}
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(e) => setValue(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            padding: "0 12px",
            border: `1px solid ${bad ? "var(--warn-line)" : "var(--line)"}`,
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          disabled={!parsed?.ok || busy}
          aria-busy={busy}
          style={{ ...btn, opacity: parsed?.ok || busy ? 1 : 0.5 }}
        >
          <Icon name="plus" size={18} />
          追加
        </button>
      </div>
      {bad && (
        <p role="status" style={{ margin: "6px 0 0", fontSize: 13, color: "var(--warn)" }}>
          ⚠ YouTube の配信アーカイブか、Twitch のアーカイブの URL を入れてください
        </p>
      )}
    </form>
  );
}
