"use client";
import { useEffect, useState } from "react";
import type { Filter } from "../lib/chat-filter";
import {
  defaultName,
  MAX_NAME,
  parseSaved,
  removeSaved,
  restoreSaved,
  SAVED_KEY,
  type Saved,
  type SaveReason,
  sameAs,
  saveFilter,
} from "../lib/saved-filters";

const REASON: Record<SaveReason, string> = {
  empty: "名前を入れてください",
  long: `名前は ${MAX_NAME} 文字までです`,
  nothing: "絞り込みか重ねる言葉を足すと保存できます",
  full: "保存できるのは 20 個までです。使わないものを消してください",
};

const pill = {
  minHeight: 44,
  padding: "0 12px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
  font: "inherit",
} as const;

/**
 * よく使う絞り込み（#67）。今の絞り込み（ワード・ユーザー・形・グラフに重ねる言葉）に名前を付けて保存し、
 * チップで呼び出す。保存はこのブラウザ。消したときはお知らせの［元に戻す］で戻せる（部品 4-2）。
 */
export function SavedFilters({
  filter,
  terms,
  onApply,
  onDone,
  onUndoable,
  onError,
}: {
  filter: Filter;
  terms: string[];
  onApply: (s: Saved) => void;
  onDone: (message: string) => void;
  onUndoable: (message: string, undo: () => void) => void;
  onError: (message: string) => void;
}) {
  const [list, setList] = useState<Saved[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setList(parseSaved(localStorage.getItem(SAVED_KEY)));
    } catch {
      setList([]);
    }
  }, []);

  const write = (next: Saved[]) => {
    setList(next);
    try {
      if (next.length === 0) localStorage.removeItem(SAVED_KEY);
      else localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      onError("絞り込みをこのブラウザに保存できませんでした。");
    }
  };

  // 今の絞り込みがもう保存してあるものと同じなら、保存のボタンは出さない
  const canSave = defaultName(filter, terms) !== "" && !list.some((s) => sameAs(s, filter, terms));
  const save = () => {
    const r = saveFilter(list, name, filter, terms);
    if (!r.ok) {
      setError(REASON[r.reason]);
      return;
    }
    write(r.list);
    setEditing(false);
    setError(null);
    onDone(`「${name.trim()}」を${r.replaced ? "上書き" : ""}保存しました。`);
  };

  const remove = (target: string) => {
    const r = removeSaved(list, target);
    if (!r.removed) return;
    const removed = r.removed;
    write(r.list);
    onUndoable(`「${target}」を消しました。`, () => {
      // 戻すときは、その時点の保存を読み直してから足す（ほかのタブでの保存を消さない）
      let cur = r.list;
      try {
        cur = parseSaved(localStorage.getItem(SAVED_KEY));
      } catch {}
      write(restoreSaved(cur, removed, r.index));
    });
  };

  if (list.length === 0 && !canSave) return null;

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
      {list.length > 0 && (
        <>
          <span id="saved-filters-label">保存した絞り込み</span>
          <ul
            aria-labelledby="saved-filters-label"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {list.map((s) => {
              const on = sameAs(s, filter, terms);
              return (
                <li
                  key={s.name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid var(--accent-dark)",
                    borderRadius: 16,
                    background: on ? "var(--accent-weak)" : "var(--surface)",
                    color: "var(--accent-dark)",
                    fontSize: 14,
                    maxWidth: "100%",
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onApply(s)}
                    style={{
                      minHeight: 44,
                      padding: "0 4px 0 12px",
                      border: 0,
                      background: "none",
                      color: "inherit",
                      font: "inherit",
                      fontWeight: on ? 700 : 400,
                      cursor: "pointer",
                      overflowWrap: "anywhere",
                      textAlign: "left",
                    }}
                  >
                    {on && "✓ "}
                    {s.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`${s.name} を消す`}
                    onClick={() => remove(s.name)}
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
              );
            })}
          </ul>
        </>
      )}
      {editing ? (
        <div style={{ display: "grid", gap: 4 }}>
          <label htmlFor="saved-filter-name">名前</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              id="saved-filter-name"
              type="text"
              value={name}
              maxLength={MAX_NAME + 10}
              // biome-ignore lint/a11y/noAutofocus: 「保存」を押した直後に名前を打てるように
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  save();
                } else if (e.key === "Escape") setEditing(false);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                padding: "0 10px",
                boxSizing: "border-box",
                border: `1px solid ${error ? "var(--danger-line)" : "var(--line)"}`,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                font: "inherit",
              }}
            />
            <button type="button" onClick={save} style={{ ...pill, minWidth: 56 }}>
              保存
            </button>
            <button type="button" onClick={() => setEditing(false)} style={pill}>
              やめる
            </button>
          </div>
          {error && (
            <span role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
        </div>
      ) : (
        canSave && (
          <button
            type="button"
            onClick={() => {
              setName(defaultName(filter, terms));
              setError(null);
              setEditing(true);
            }}
            style={{ ...pill, justifySelf: "start" }}
          >
            ＋ 今の絞り込みを保存
          </button>
        )
      )}
    </div>
  );
}
