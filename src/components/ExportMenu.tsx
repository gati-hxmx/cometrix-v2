"use client";
import { useEffect, useRef, useState } from "react";
import { clipsKey, parseClips } from "../lib/clip-ranges";
import { chapterText, exportFileName, markerXml, ytDlpCommand } from "../lib/export";
import type { TocEntry } from "../lib/toc";
import { Icon, type IconName } from "./Icon";

/**
 * 書き出しの ⋮ メニュー（#59、部品 5-9 の小さなメニュー）。あまり使わない操作なので、分析の枠の右上の ⋮ にまとめる。
 * 動画そのものは落とさない（YouTube の規約）。yt-dlp のコマンドは、使う人が自分の手元で動かすためのもの。
 */
export function ExportMenu({
  jobId,
  title,
  videoUrl,
  durationSec,
  filterQuery,
  filtering,
  toc,
  unit,
  onDone,
  onError,
}: {
  jobId: string;
  title: string;
  videoUrl: string;
  durationSec: number;
  /** チャット一覧の絞り込み（q・user など）。CSV も同じ絞り込みで出す。 */
  filterQuery: string;
  filtering: boolean;
  /** 今グラフに出している数の目次の山 */
  toc: TocEntry[];
  unit: string;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [clipCount, setClipCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    setClipCount(readClips(jobId).length);
    first.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, jobId]);

  const copy = async (text: string | null, done: string) => {
    setOpen(false);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onDone(done);
    } catch {
      onError("コピーできませんでした。");
    }
  };

  const saveXml = () => {
    setOpen(false);
    const clips = readClips(jobId);
    if (clips.length === 0) return;
    const blob = new Blob([markerXml(title, durationSec, clips)], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(title, "xml");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const chapters = chapterText(toc, unit);
  const noClips = clipCount === 0 ? "「範囲」で切り抜きの範囲を足すと使えます" : null;
  const csvHref = `/api/jobs/${jobId}/export${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <div ref={box}>
      <button
        type="button"
        aria-label="書き出し"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 44,
          height: 44,
          font: "inherit",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          color: "var(--text)",
          background: open ? "var(--surface-2)" : "transparent",
          border: "1px solid transparent",
          borderRadius: "var(--radius)",
        }}
      >
        ⋮
      </button>
      {open && (
        <div role="menu" aria-label="書き出し" className="menu-pop">
          <a
            ref={first}
            role="menuitem"
            href={csvHref}
            download={exportFileName(title, "csv")}
            onClick={() => setOpen(false)}
            style={row}
          >
            <RowText
              icon="download"
              text={filtering ? "絞り込んだチャットを CSV で保存" : "チャットを CSV で保存"}
            />
          </a>
          <MenuButton
            icon="copy"
            text="目次をチャプター文でコピー"
            note="YouTube の説明欄に貼れる形"
            disabledNote={chapters ? null : "盛り上がりが2つ以上あると使えます"}
            onClick={() => copy(chapters, "チャプター文をコピーしました。")}
          />
          <MenuButton
            icon="copy"
            text="範囲を yt-dlp のコマンドでコピー"
            note="手元のパソコンで、範囲だけを落とす"
            disabledNote={noClips}
            onClick={() =>
              copy(ytDlpCommand(videoUrl, readClips(jobId)), "yt-dlp のコマンドをコピーしました。")
            }
          />
          <MenuButton
            icon="download"
            text="範囲を編集ソフト用の XML で保存"
            note="Premiere Pro・DaVinci Resolve で読めるマーカー"
            disabledNote={noClips}
            onClick={saveXml}
          />
        </div>
      )}
    </div>
  );
}

/** 「範囲」で足した切り抜きの範囲（ブラウザに保存、#58）。読めなければ空。 */
function readClips(jobId: string) {
  try {
    return parseClips(localStorage.getItem(clipsKey(jobId)));
  } catch {
    return [];
  }
}

const row = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  minHeight: 48,
  padding: "8px 12px",
  font: "inherit",
  textAlign: "left",
  color: "var(--text)",
  textDecoration: "none",
  background: "transparent",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
} as const;

function RowText({ icon, text, note }: { icon: IconName; text: string; note?: string | null }) {
  return (
    <>
      <Icon name={icon} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span>{text}</span>
        {note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{note}</span>}
      </span>
    </>
  );
}

function MenuButton({
  icon,
  text,
  note,
  disabledNote,
  onClick,
}: {
  icon: IconName;
  text: string;
  note?: string;
  disabledNote: string | null;
  onClick: () => void;
}) {
  const disabled = disabledNote !== null;
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{ ...row, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}
    >
      <RowText icon={icon} text={text} note={disabled ? disabledNote : note} />
    </button>
  );
}
