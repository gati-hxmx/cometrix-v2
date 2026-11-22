"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addClip,
  CLIP_MAX,
  CLIP_NAME_MAX,
  type Clip,
  clipLabel,
  clipsKey,
  formatClock,
  parseClips,
  parseClock,
  rangeError,
  removeClip,
  serializeClips,
  updateClip,
} from "../lib/clip-ranges";
import { Toast } from "./Toast";

const SAVE_MS = 500;
const btn = {
  minHeight: 44,
  padding: "0 14px",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  font: "inherit",
  color: "var(--text)",
  cursor: "pointer",
} as const;
const field = {
  minHeight: 44,
  width: "100%",
  minWidth: 0,
  padding: "0 10px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  boxSizing: "border-box",
} as const;
const small = { margin: 0, color: "var(--muted)", fontSize: 13 } as const;
const errText = { margin: 0, color: "var(--danger)", fontSize: 13 } as const;

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 時刻の入力欄＋「今の位置」。 */
function TimeField({
  label,
  value,
  onChange,
  onBlur,
  onNow,
  nowLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onNow: () => void;
  nowLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label style={{ flex: "1 1 0", minWidth: 0, display: "block" }}>
        <span style={small}>{label}</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder="0:00"
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          style={field}
        />
      </label>
      <button type="button" style={{ ...btn, alignSelf: "flex-end" }} onClick={onNow}>
        {nowLabel}
      </button>
    </div>
  );
}

/**
 * 一覧の1行。ふだんは「▶ 名前・始点〜終点（長さ）」と［直す］［削除］だけを出す。
 * ［直す］で開いた1行だけに名前・始点・終点の欄を出し、変えても保存せず、
 * ［この範囲で保存］で1回だけ保存する（18項目の14）。［キャンセル］で元に戻して閉じる。
 */
function ClipRow({
  clip,
  index,
  editing,
  getTime,
  onSeek,
  onEdit,
  onSave,
  onRemove,
}: {
  clip: Clip;
  index: number;
  editing: boolean;
  getTime: () => number;
  onSeek: (sec: number) => void;
  onEdit: (open: boolean) => void;
  onSave: (patch: Omit<Clip, "id">) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(clip.name);
  const [start, setStart] = useState(formatClock(clip.start));
  const [end, setEnd] = useState(formatClock(clip.end));

  // 開くたびに、保存済みの値から始める。
  useEffect(() => {
    if (!editing) return;
    setName(clip.name);
    setStart(formatClock(clip.start));
    setEnd(formatClock(clip.end));
  }, [editing, clip.name, clip.start, clip.end]);

  const s = parseClock(start);
  const e = parseClock(end);
  const error = rangeError(s, e);
  const changed = name !== clip.name || s !== clip.start || e !== clip.end;
  const canSave = error === null && changed;
  const now = () => formatClock(Math.floor(getTime()));
  const label = clipLabel(clip, index);

  return (
    <li
      style={{
        listStyle: "none",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onSeek(clip.start)}
          aria-label={`${label} を始点から再生`}
          style={{
            ...btn,
            flex: "1 1 0",
            minWidth: 0,
            border: 0,
            textAlign: "left",
            overflowWrap: "anywhere",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--accent-dark)" }}>▶ {label}</span>
          <span style={{ ...small, display: "block" }}>
            {formatClock(clip.start)}〜{formatClock(clip.end)}（{formatClock(clip.end - clip.start)}
            ）
          </span>
        </button>
        {!editing && (
          <button
            type="button"
            style={btn}
            onClick={() => onEdit(true)}
            aria-label={`${label} を直す`}
          >
            直す
          </button>
        )}
        <button type="button" style={btn} onClick={onRemove} aria-label={`${label} を削除`}>
          削除
        </button>
      </div>
      {editing && (
        <>
          <label style={{ display: "block" }}>
            <span style={small}>名前</span>
            <input
              value={name}
              maxLength={CLIP_NAME_MAX}
              placeholder={`範囲 ${index + 1}`}
              onChange={(ev) => setName(ev.target.value)}
              style={field}
            />
          </label>
          <TimeField
            label="始点"
            value={start}
            onChange={setStart}
            onNow={() => setStart(now())}
            nowLabel="今の位置"
          />
          <TimeField
            label="終点"
            value={end}
            onChange={setEnd}
            onNow={() => setEnd(now())}
            nowLabel="今の位置"
          />
          {error && <p style={errText}>{error}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => {
                if (!canSave || s === null || e === null) return;
                onSave({ name, start: s, end: e });
                onEdit(false);
              }}
              style={{
                ...btn,
                fontWeight: 700,
                background: canSave ? "var(--accent)" : "var(--surface)",
                color: canSave ? "var(--on-accent)" : "var(--muted)",
                border: canSave ? "1px solid var(--accent)" : "1px solid var(--line)",
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              この範囲で保存
            </button>
            <button type="button" style={btn} onClick={() => onEdit(false)}>
              キャンセル
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** 切り抜きの範囲（始点・終点）を残して並べる（#58）。保存はブラウザ（localStorage、分析ごと）。 */
export function ClipPanel({
  jobId,
  getTime,
  onSeek,
  onError,
  picked,
  onPickMode,
  onMark,
}: {
  jobId: string;
  getTime: () => number;
  onSeek: (sec: number) => void;
  onError: (message: string) => void;
  /** グラフをなぞって選んだ範囲。n が変わるたびに新しい選択。 */
  picked: { start: number; end: number; n: number } | null;
  /** 「グラフでなぞる」の入り切り。 */
  onPickMode: (on: boolean) => void;
  /** グラフに薄く示す範囲（作りかけのもの）。 */
  onMark: (mark: { start: number; end: number } | null) => void;
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pick, setPick] = useState(false);
  const [undo, setUndo] = useState<Clip | null>(null);
  const [restored, setRestored] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeRestored = useCallback(() => setRestored(false), []);
  const warned = useRef(false);

  useEffect(() => {
    setLoaded(false);
    setUndo(null);
    try {
      setClips(parseClips(localStorage.getItem(clipsKey(jobId))));
    } catch {
      setClips([]);
    }
    setLoaded(true);
  }, [jobId]);

  // 変更が止まってから保存する。読み込み前の空の値で上書きしない。
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        if (clips.length === 0) localStorage.removeItem(clipsKey(jobId));
        else localStorage.setItem(clipsKey(jobId), serializeClips(clips));
        warned.current = false;
      } catch {
        if (!warned.current) onError("範囲をこのブラウザに保存できませんでした。");
        warned.current = true;
      }
    }, SAVE_MS);
    return () => clearTimeout(t);
  }, [clips, loaded, jobId, onError]);

  // グラフでなぞった範囲を、始点・終点の欄に入れる。
  const lastPicked = useRef<number | null>(null);
  useEffect(() => {
    if (!picked || picked.n === lastPicked.current) return;
    lastPicked.current = picked.n;
    setStart(formatClock(picked.start));
    setEnd(formatClock(picked.end));
  }, [picked]);

  const s = start.trim() === "" ? null : parseClock(start);
  const e = end.trim() === "" ? null : parseClock(end);
  const both = s !== null && e !== null;
  const error = both ? rangeError(s, e) : null;
  const touched = start.trim() !== "" || end.trim() !== "";
  const badInput = (start.trim() !== "" && s === null) || (end.trim() !== "" && e === null);
  const canAdd = both && error === null && clips.length < CLIP_MAX;

  // 作りかけの範囲をグラフに薄く出す。
  useEffect(() => {
    onMark(both && error === null ? { start: s, end: e } : null);
  }, [both, error, s, e, onMark]);
  useEffect(() => () => onMark(null), [onMark]);
  useEffect(() => () => onPickMode(false), [onPickMode]);

  const togglePick = () => {
    setPick((v) => {
      onPickMode(!v);
      return !v;
    });
  };
  const now = () => Math.floor(getTime());
  const add = () => {
    if (!canAdd) return;
    const next = addClip(clips, { id: newId(), name: "", start: s, end: e });
    if (!next) return;
    setClips(next);
    setStart("");
    setEnd("");
  };
  const remove = (c: Clip) => {
    setClips((list) => removeClip(list, c.id));
    if (editingId === c.id) setEditingId(null);
    setRestored(false);
    setUndo(c);
  };
  const restore = () => {
    if (!undo) return;
    const next = addClip(clips, undo);
    if (next) setClips(next);
    setUndo(null);
    setRestored(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <TimeField
          label="始点"
          value={start}
          onChange={setStart}
          onNow={() => setStart(formatClock(now()))}
          nowLabel="ここから"
        />
        <TimeField
          label="終点"
          value={end}
          onChange={setEnd}
          onNow={() => setEnd(formatClock(now()))}
          nowLabel="ここまで"
        />
        {touched && (error || badInput) && (
          <p style={errText}>⚠ {error ?? "時刻は 1:23 か 1:02:03 の形で入れてください"}</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={pick}
            onClick={togglePick}
            style={{
              ...btn,
              fontWeight: 700,
              border: `1px solid ${pick ? "var(--accent-line)" : "var(--line)"}`,
              background: pick ? "var(--accent-weak)" : "var(--surface)",
              color: pick ? "var(--accent-dark)" : "var(--text)",
            }}
          >
            グラフでなぞる{pick ? "（入）" : ""}
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={add}
            style={{
              ...btn,
              fontWeight: 700,
              opacity: canAdd ? 1 : 0.5,
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            ＋ 追加
          </button>
        </div>
        {pick && <p style={small}>グラフの上を左右になぞると、その範囲が始点・終点に入ります</p>}
        {clips.length >= CLIP_MAX && <p style={small}>範囲は {CLIP_MAX} 件までです</p>}
      </div>

      <div style={{ overflowY: "auto", minHeight: 0, flex: 1, maxHeight: "60vh" }}>
        {clips.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            範囲はまだありません。切り抜きたい場面の始点と終点を入れて追加します
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {clips.map((c, i) => (
              <ClipRow
                key={c.id}
                clip={c}
                index={i}
                editing={editingId === c.id}
                getTime={getTime}
                onSeek={onSeek}
                onEdit={(open) => setEditingId(open ? c.id : null)}
                onSave={(patch) => setClips((list) => updateClip(list, c.id, patch))}
                onRemove={() => remove(c)}
              />
            ))}
          </ul>
        )}
      </div>
      {/* 削除のお知らせは画面の下に、［元に戻す］つきで ✕ まで残す（基本 8-1）。 */}
      <Toast
        kind="done"
        message={undo ? `${undo.name.trim() || "範囲"}を削除しました` : null}
        onUndo={restore}
        onClose={() => setUndo(null)}
      />
      <Toast kind="done" message={restored ? "元に戻しました" : null} onClose={closeRestored} />
    </div>
  );
}
