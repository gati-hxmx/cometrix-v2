"use client";
import { useEffect, useRef, useState } from "react";
import type { Bucket } from "../lib/chart";
import { drawChart, IMAGE_H, IMAGE_W, type Palette } from "../lib/chart-image";
import { clipsKey, parseClips } from "../lib/clip-ranges";
import { chapterText, exportFileName, markerXml, ytDlpCommand } from "../lib/export";
import { sharePath } from "../lib/share-url";
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
  graph,
  shareToken,
  onShareToken,
  onDone,
  onUndoable,
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
  /** 今グラフに出している範囲（拡大していればその範囲）。画像で保存する（#69）。 */
  graph: { heading: string; buckets: Bucket[]; combine: "sum" | "max" } | null;
  /** 共有リンクの鍵（#68）。共有していなければ null */
  shareToken: string | null;
  onShareToken: (token: string | null) => void;
  onDone: (text: string) => void;
  /** ［元に戻す］つきのお知らせ */
  onUndoable: (text: string, undo: () => Promise<boolean>) => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [clipCount, setClipCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /** 閉じる。キーや項目で閉じたときは ⋮ にフォーカスを戻す（外を押したときは戻さない）。 */
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    setClipCount(readClips(jobId).length);
    first.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      // ↑ ↓ Home End で項目を移る（role=menu の決まった動き）
      const items = Array.from(
        box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (at + 1) % items.length
          : e.key === "ArrowUp"
            ? (at - 1 + items.length) % items.length
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : null;
      if (next === null || items.length === 0) return;
      e.preventDefault();
      items[next].focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, jobId]);

  const copy = async (text: string | null, done: string) => {
    close(true);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onDone(done);
    } catch {
      onError("コピーできませんでした。");
    }
  };

  const saveXml = () => {
    close(true);
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

  const savePng = () => {
    close(true);
    if (!graph) return;
    const canvas = document.createElement("canvas");
    const scale = 2; // 投稿先で縮んでも読めるよう倍の細かさで描く
    canvas.width = IMAGE_W * scale;
    canvas.height = IMAGE_H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onError("画像を作れませんでした。");
      return;
    }
    ctx.scale(scale, scale);
    const bucketSec =
      graph.buckets.length > 1 ? graph.buckets[1].startSec - graph.buckets[0].startSec : 30;
    drawChart(ctx, { title, unit, bucketSec, ...graph }, readPalette(graph.heading));
    canvas.toBlob((blob) => {
      if (!blob) {
        onError("画像を作れませんでした。");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = exportFileName(title, "png");
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      onDone("グラフを画像で保存しました。");
    }, "image/png");
  };

  /** 共有リンクを作って（あればそのまま）コピーする。鍵を待つあいだもコピーの許可が切れないよう、ClipboardItem に約束を渡す。 */
  const copyShare = async () => {
    close(true);
    const make = async () => {
      const res = await fetch(`/api/jobs/${jobId}/share`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { token } = (await res.json()) as { token: string };
      onShareToken(token);
      return new URL(sharePath(token), window.location.origin).toString();
    };
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const url = make();
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await make());
      }
      onDone("共有リンクをコピーしました。");
    } catch {
      onError("共有リンクをコピーできませんでした。もう一度試してください。");
    }
  };

  /** 共有をやめる。［元に戻す］で同じリンクのまま再開する。 */
  const stopShare = async () => {
    close(true);
    const res = await fetch(`/api/jobs/${jobId}/share`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      onError("共有をやめられませんでした。もう一度試してください。");
      return;
    }
    onShareToken(null);
    onUndoable("共有をやめました。リンクは開けなくなりました。", async () => {
      const back = await fetch(`/api/jobs/${jobId}/share`, { method: "POST" }).catch(() => null);
      if (!back?.ok) {
        onError("元に戻せませんでした。");
        return false;
      }
      onShareToken(((await back.json()) as { token: string }).token);
      return true;
    });
  };

  const chapters = chapterText(toc, { unit, durationSec });
  const noClips = clipCount === 0 ? "「範囲」で切り抜きの範囲を足すと使えます" : null;
  const csvHref = `/api/jobs/${jobId}/export${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <div ref={box}>
      <button
        ref={trigger}
        type="button"
        aria-label="書き出しと共有"
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
        <div
          role="menu"
          aria-label="書き出しと共有"
          className="menu-pop"
          onBlur={(e) => {
            // Tab でメニューの外へ出たら閉じる（後ろの画面にフォーカスがあるのに開いたままにしない）
            if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          <a
            ref={first}
            role="menuitem"
            href={csvHref}
            download={exportFileName(title, "csv")}
            onClick={() => close(true)}
            style={row}
          >
            <RowText
              icon="download"
              text={filtering ? "絞り込んだチャットを CSV で保存" : "チャットを CSV で保存"}
            />
          </a>
          <a role="menuitem" href={`/compare?ids=${jobId}`} style={row}>
            <RowText
              icon="layers"
              text="コラボを重ねて比べる"
              note="ほかの配信と同じ時間軸でグラフを重ねる"
            />
          </a>
          <MenuButton
            icon="link"
            text="共有リンクをコピー"
            note="読むだけのページ。チャットの名前とメモは出ません"
            disabledNote={null}
            onClick={copyShare}
          />
          {shareToken && (
            <MenuButton
              icon="link-2-off"
              text="共有をやめる"
              note="共有したリンクを開けなくします"
              disabledNote={null}
              onClick={stopShare}
            />
          )}
          <MenuButton
            icon="download"
            text="グラフを画像で保存"
            note="今見ている範囲を PNG で。X や切り抜きに"
            disabledNote={graph ? null : "グラフが出てから使えます"}
            onClick={savePng}
          />
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

/** 今の見た目（ライト・ダーク）の色を画像に使う。笑いの数は笑いの色の棒。 */
function readPalette(heading: string): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v("--surface"),
    text: v("--text"),
    muted: v("--muted"),
    line: v("--line"),
    bar: heading.startsWith("笑い") ? v("--chart-2") : v("--chart-1"),
    peak: v("--accent"),
    font: getComputedStyle(document.body).fontFamily,
  };
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
  boxSizing: "border-box",
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

function RowText({
  icon,
  text,
  note,
  dim = false,
}: {
  icon: IconName;
  text: string;
  note?: string | null;
  /** 使えない行。アイコンと名前だけを薄くし、理由の文は読める濃さのまま残す。 */
  dim?: boolean;
}) {
  const faded = dim ? { opacity: 0.5 } : undefined;
  return (
    <>
      <span style={{ display: "inline-flex", ...faded }}>
        <Icon name={icon} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={faded}>{text}</span>
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
      style={{ ...row, cursor: disabled ? "default" : "pointer" }}
    >
      <RowText icon={icon} text={text} note={disabled ? disabledNote : note} dim={disabled} />
    </button>
  );
}
