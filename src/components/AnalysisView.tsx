"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bucket } from "../lib/chart";
import { EMPTY_FILTER, filterParams, isFiltering } from "../lib/chat-filter";
import { cleanClips } from "../lib/clips";
import type { Donation } from "../lib/donations";
import { keyAction, stepPeak } from "../lib/keys";
import { LEAD_DEFAULT, LEAD_KEY, type Lead, leadTarget, parseLead } from "../lib/lead";
import { STEP_DEFAULT, seekTarget } from "../lib/playback";
import { type FetchProgress, progressLabel, progressPercent } from "../lib/progress";
import {
  dominantReaction,
  type ReactionBucket,
  type ReactionKey,
  reactionTotals,
} from "../lib/reactions";
import {
  parseReel,
  REEL_DEFAULT,
  REEL_KEY,
  type ReelItem,
  type ReelSettings,
  reelDurationSec,
  reelKeyValue,
  reelPlan,
  reelStep,
  reelTotalSec,
} from "../lib/reel";
import { pickPeaks } from "../lib/toc";
import { BucketChart, type ChartReel } from "./BucketChart";
import { ChatList, type Filter } from "./ChatList";
import { ClipPanel } from "./ClipPanel";
import { ExportMenu } from "./ExportMenu";
import { KeywordLines } from "./KeywordLines";
import { MemoPanel } from "./MemoPanel";
import { PeoplePanel } from "./PeoplePanel";
import { PlaybackBar } from "./PlaybackBar";
import { Player } from "./Player";
import { ReactionChips } from "./ReactionChips";
import { ReanalyzeButton } from "./ReanalyzeButton";
import { ReelMini, type ReelNow, ReelStart, ReelStatus } from "./ReelControls";
import { SavedFilters } from "./SavedFilters";
import { Segmented } from "./Segmented";
import { Toast } from "./Toast";
import { TocPanel } from "./TocPanel";
import { UrlForm } from "./UrlForm";
import type { PlayerHandle } from "./YoutubePlayer";

const KEYS_SEEN_KEY = "cometrix-keys-seen";

type Note = { id: number; message: string; undo?: () => unknown };

/** お知らせ1つ。閉じる・戻すの関数を id ごとに固定して、4秒で消える時計が描き直しで止まらないようにする。 */
function NoteToast({
  note,
  onClose,
  onUndo,
}: {
  note: Note;
  onClose: (id: number) => void;
  onUndo: (id: number) => void;
}) {
  const close = useCallback(() => onClose(note.id), [onClose, note.id]);
  const undo = useCallback(() => onUndo(note.id), [onUndo, note.id]);
  return (
    <Toast
      kind="done"
      message={note.message}
      onClose={close}
      onUndo={note.undo ? undo : undefined}
    />
  );
}

type Job = {
  status: "queued" | "running" | "done" | "failed";
  platform?: "youtube" | "twitch";
  videoId?: string | null;
  result?: {
    videoId: string;
    title: string;
    totalComments: number;
    lastBucketSec?: number;
    clips?: unknown;
  } | null;
  error?: { code: string; message: string } | null;
  progress?: FetchProgress | null;
  /** done／failed のとき、あと何秒で分析し直せるか（#99）。 */
  retryAfterSec?: number | null;
  /** 共有リンクの鍵（#68）。共有していなければ null */
  shareToken?: string | null;
};
type State =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "job"; job: Job; buckets: Bucket[] | null };

const POLL_MS = 3000;
const TABS = [
  { key: "chat", name: "チャット" },
  { key: "memo", name: "メモ" },
  { key: "toc", name: "目次" },
  { key: "clip", name: "範囲" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const SERIES = [
  { key: "all", name: "すべて" },
  { key: "laugh", name: "笑い" },
  { key: "users", name: "人数" },
  { key: "reactions", name: "反応" },
] as const;
const SPAM = [
  { key: "on", name: "スパム除外" },
  { key: "off", name: "除外なし" },
] as const;
const card = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 16,
} as const;

/** 文字のリンク。スマホでも押せる範囲を高さ・幅とも 44px 以上にする（基本 8）。 */
const backLink = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  minWidth: 44,
  color: "var(--accent-dark)",
} as const;

/** 取得中の進み具合（#43）。長さが分からないときはバーを出さず、取得済みの時刻だけ出す。 */
function FetchProgressBar({ progress }: { progress: FetchProgress }) {
  const pct = progressPercent(progress);
  return (
    <div style={{ marginTop: 12 }}>
      {pct !== null && (
        <div
          role="progressbar"
          aria-label="チャットの取得"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{
            height: 8,
            background: "var(--surface-2)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--accent)",
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 13,
          color: "var(--accent-dark)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {progressLabel(progress)}
      </p>
      {/* 数字は2〜3秒ごとに変わるので読み上げず、段階が変わったときだけ知らせる。 */}
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {progress.stage === "saving"
          ? "取得が終わりました。集計して保存しています"
          : "チャットを取得しています"}
      </span>
    </div>
  );
}

/** 分析画面（docs/screens/analysis.md 案 A）。チャット一覧は #5。 */
export function AnalysisView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [toast, setToast] = useState<string | null>(null);
  // できました（4秒で消える）のお知らせ。書き出しのコピーなど（#59）。
  // できました・［元に戻す］のお知らせ。基本 8-1 のとおり、3つまで重ねて新しいものを上に出す。
  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);
  const pushNote = useCallback((message: string, undo?: () => unknown) => {
    noteId.current += 1;
    const id = noteId.current;
    setNotes((cur) => [...cur, { id, message, undo }].slice(-3));
  }, []);
  const closeNote = useCallback((id: number) => {
    setNotes((cur) => cur.filter((n) => n.id !== id));
  }, []);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const undoNote = useCallback(async (id: number) => {
    // 戻すのに時間がかかるもの（共有の再開など）は結果を待ち、失敗したらこのお知らせは消す（失敗は別のお知らせで出る）
    const ok = await notesRef.current.find((x) => x.id === id)?.undo?.();
    if (ok === false) {
      setNotes((cur) => cur.filter((x) => x.id !== id));
      return;
    }
    // 戻したら、同じ場所で「元に戻しました」に替える（部品 4-2）
    setNotes((cur) => cur.map((x) => (x.id === id ? { id, message: "元に戻しました。" } : x)));
  }, []);
  // 分析し直したあとにポーリングを再開するための番号（#99）。
  const [reload, setReload] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);
  const router = useRouter();
  const player = useRef<PlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  // 保存した絞り込みの呼び出し（#67）
  const [preset, setPreset] = useState<{ filter: Filter; n: number } | null>(null);
  // 共有リンクの鍵（#68）。読み込んだ値から始め、⋮ メニューで作る・やめると入れ替える
  const [shareToken, setShareToken] = useState<string | null | undefined>(undefined);
  const chatBox = useRef<HTMLElement>(null);
  // よくコメントした人（#64）の名前を押したとき：チャットをその人だけに絞り、チャットの札を見せる
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const pickAuthor = useCallback(
    (term: string, author: string) => {
      // 含めるユーザーだけを入れ替え、ほかの絞り込みは残す。前の絞り込みには［元に戻す］で戻れる
      const before = filterRef.current;
      const apply = (f: Filter) => setPreset((p) => ({ filter: f, n: (p?.n ?? 0) + 1 }));
      apply({ ...before, user: [term] });
      pushNote(`チャットを「${author}」のコメントだけにしました。`, () => apply(before));
      setTab("chat");
      const box = chatBox.current;
      if (box) {
        const r = box.getBoundingClientRect();
        // チャットがほとんど見えていないとき（スマホでは下にある）だけ、チャットまで動かす
        if (r.bottom < 160 || r.top > window.innerHeight - 160)
          box.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [pushNote],
  );
  const [tab, setTab] = useState<Tab>("chat");
  const [stampSignal, setStampSignal] = useState(0);
  // 今グラフに出している範囲（区間の番号）。画像の保存に使う（#69）。
  const [chartRange, setChartRange] = useState<{ start: number; end: number } | null>(null);
  // キー操作の案内は、一度キーを使うまで出す（部品 4-8）。読めないブラウザでは出したまま。
  const [keysSeen, setKeysSeen] = useState(true);
  useEffect(() => {
    try {
      setKeysSeen(localStorage.getItem(KEYS_SEEN_KEY) === "1");
    } catch {
      setKeysSeen(false);
    }
  }, []);
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<{ start: number; end: number; n: number } | null>(null);
  const [mark, setMark] = useState<{ start: number; end: number } | null>(null);
  const [filtered, setFiltered] = useState<Bucket[] | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [series, setSeries] = useState<"all" | "laugh" | "users" | "reactions">("all");
  // 反応の種類（#62）。「反応」のときは棒を種類で積み上げ、札で選んだ種類を下に置いて浮かせる。
  const reactions = series === "reactions";
  const [reactFocus, setReactFocus] = useState<ReactionKey | null>(null);
  const [reactRows, setReactRows] = useState<ReactionBucket[] | null>(null);
  const [reactError, setReactError] = useState(false);
  const [reactTry, setReactTry] = useState(0);
  const laugh = series === "laugh";
  // コメントした人の数（同じ人の連投は1人。#55）。
  const users = series === "users";
  const [terms, setTerms] = useState<string[]>([]);
  // 言葉ごとの数（読み込めたものだけ）。言葉を外しても、同じ言葉を足し直したときに使い回す。
  const [termData, setTermData] = useState<Record<string, Bucket[]>>({});
  const [spamMode, setSpamMode] = useState<"on" | "off">("on");
  const spam = spamMode === "on";
  const onFilter = useCallback((f: Filter) => setFilter(f), []);
  const getTime = useCallback(() => player.current?.getTime() ?? 0, []);
  const filtering = isFiltering(filter);
  const isDone = state.kind === "job" && state.job.status === "done";

  // 絞り込み中・笑いを選んだときは、一致したコメントの数でグラフを描き直す。
  const recount = filtering || laugh || spam || users;
  useEffect(() => {
    if (!recount || !isDone) {
      setFiltered(null);
      return;
    }
    let stale = false;
    // 前の絞り込みの結果を、新しい条件の結果として見せない。
    setFiltered(null);
    const p = filterParams(filter);
    if (laugh) p.set("laugh", "1");
    if (spam) p.set("spam", "1");
    if (users) p.set("users", "1");
    fetch(`/api/jobs/${id}/buckets?${p}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Bucket[]>;
      })
      .then((b) => !stale && setFiltered(b))
      .catch(
        () =>
          !stale &&
          setToast(
            laugh
              ? "笑いのグラフを読み込めませんでした。"
              : users
                ? "人数のグラフを読み込めませんでした。"
                : filtering
                  ? "絞り込んだグラフを読み込めませんでした。"
                  : "グラフを読み込めませんでした。",
          ),
      );
    return () => {
      stale = true;
    };
  }, [filter, recount, laugh, spam, users, isDone, id, filtering]);

  // 投げ銭の印（#57）。読めなくても分析は使えるので、失敗は黙って印なしにする。
  useEffect(() => {
    if (!isDone) return;
    let stale = false;
    fetch(`/api/jobs/${id}/donations`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Donation[]>) : []))
      .then((d) => !stale && setDonations(d))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [isDone, id]);
  // 反応の種類ごとの数（#62）。「すべて」の名札と「反応」の積み上げに使う。絞り込み・スパム除外はグラフと同じ。
  const wantReactions = isDone && (series === "all" || reactions);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reactTry は［もう一度］で読み直す合図
  useEffect(() => {
    if (!wantReactions) return;
    let stale = false;
    setReactRows(null);
    setReactError(false);
    const p = filterParams(filter);
    if (spam) p.set("spam", "1");
    fetch(`/api/jobs/${id}/reactions?${p}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<ReactionBucket[]>;
      })
      .then((b) => !stale && setReactRows(b))
      // 「すべて」の名札は出なくても困らないので、知らせるのは「反応」を選んでいるときだけ
      .catch(() => {
        if (stale) return;
        // 「反応」ではグラフの枠に出す（お知らせとの二重にしない）。「すべて」の名札は出なくても困らない
        setReactError(true);
      });
    return () => {
      stale = true;
    };
  }, [wantReactions, filter, spam, id, reactTry]);
  useEffect(() => {
    if (!reactions) setReactFocus(null);
  }, [reactions]);

  // 重ねる言葉ごとに、その言葉を含むコメントの数を読む（#53）。読み込み中の言葉は二重に読まない。
  const loading = useRef(new Set<string>());
  useEffect(() => {
    if (!isDone) return;
    for (const t of terms) {
      if (termData[t] || loading.current.has(t)) continue;
      loading.current.add(t);
      fetch(`/api/jobs/${id}/buckets?${new URLSearchParams({ term: t })}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<Bucket[]>;
        })
        .then((b) => setTermData((d) => ({ ...d, [t]: b })))
        .catch(() => {
          setToast(`「${t}」の数を読み込めませんでした。`);
          setTerms((l) => l.filter((x) => x !== t));
        })
        .finally(() => loading.current.delete(t));
    }
  }, [terms, termData, isDone, id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload は分析し直し後にポーリングを始め直すための合図
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    async function tick() {
      let next: number | null = POLL_MS;
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 404) {
          setState({ kind: "notfound" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const job = (await res.json()) as Job;
        let buckets: Bucket[] | null = null;
        if (job.status === "done") {
          const b = await fetch(`/api/jobs/${id}/buckets`, { cache: "no-store" });
          if (!b.ok) throw new Error(String(b.status));
          buckets = (await b.json()) as Bucket[];
          next = null;
        } else if (job.status === "failed") next = null;
        if (stopped) return;
        misses = 0;
        setState({ kind: "job", job, buckets });
      } catch {
        misses += 1;
        if (misses === 3)
          setToast("分析の状態を確かめられません。つながり次第、自動で確かめ直します。");
      }
      if (next !== null && !stopped) timer = setTimeout(tick, next);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, reload]);

  const reanalyze = useCallback(async () => {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/jobs/${id}/reanalyze`, { method: "POST" });
      if (res.ok) {
        setFiltered(null);
        setSeries("all");
        setState({ kind: "loading" });
        setReload((n) => n + 1);
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        error?: { code?: string; message?: string };
      } | null;
      if (body?.error?.code === "duplicate" && body.id) router.push(`/analysis/${body.id}`);
      else setToast(body?.error?.message ?? "分析し直せませんでした。");
    } catch {
      setToast("分析し直せませんでした。通信を確かめて、もう一度お試しください。");
    } finally {
      setReanalyzing(false);
    }
  }, [id, router]);

  // 棒を押したときだけ、山の少し前から再生する。選んだ値はブラウザに覚える。
  const [lead, setLeadState] = useState<Lead>(LEAD_DEFAULT);
  useEffect(() => {
    try {
      setLeadState(parseLead(localStorage.getItem(LEAD_KEY)));
    } catch {
      // 保存が使えなくても初期値で動く
    }
  }, []);
  const setLead = useCallback((v: Lead) => {
    setLeadState(v);
    try {
      localStorage.setItem(LEAD_KEY, String(v));
    } catch {
      // 保存できなくても、その場の選択は効く
    }
  }, []);

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    const box = playerBox.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight)
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const seekPeak = useCallback((sec: number) => seek(leadTarget(sec, lead)), [seek, lead]);

  // キー操作（#66）。前後の山は、今グラフに出している数の目次の山を、少し前から再生する設定（lead）込みでたどる。
  const shown = recount ? filtered : state.kind === "job" ? state.buckets : null;
  // J / L は「‹ N 秒 ›」と同じ秒数で動く（PlaybackBar から受け取る）
  const [stepSec, setStepSec] = useState(STEP_DEFAULT);
  const keyState = useRef({ shown, lead, isDone, seek, stepSec });
  keyState.current = { shown, lead, isDone, seek, stepSec };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      if (!k.isDone || e.defaultPrevented) return;
      const el = e.target instanceof Element ? e.target : null;
      const action = keyAction(e, {
        tagName: el?.tagName,
        isContentEditable: el instanceof HTMLElement && el.isContentEditable,
        role: el?.getAttribute("role"),
        inChart: el?.closest("[data-chart-plot]") != null,
      });
      if (!action) return;
      if (action === "hold") {
        e.preventDefault();
        return;
      }
      const p = player.current;
      if (!p) return;
      e.preventDefault();
      setKeysSeen(true);
      try {
        localStorage.setItem(KEYS_SEEN_KEY, "1");
      } catch {}
      const now = p.getTime();
      if (action === "toggle") p.togglePlay();
      else if (action === "back") k.seek(seekTarget(now, -k.stepSec));
      else if (action === "forward") k.seek(seekTarget(now, k.stepSec));
      else if (action === "stamp") {
        setTab("memo");
        setStampSignal((n) => n + 1);
      } else {
        const targets = pickPeaks(k.shown ?? []).map((t) => leadTarget(t.startSec, k.lead));
        const to = stepPeak(targets, now, action === "next" ? 1 : -1);
        if (to !== null) k.seek(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 見どころを続けて再生（#61、docs/screens/analysis.md「見どころ再生」）。目次の山を数の多い順に、少し前から決まった秒数ずつ。
  const peaks = useMemo(() => pickPeaks(shown ?? []), [shown]);
  const [reelSettings, setReelSettingsState] = useState<ReelSettings>(REEL_DEFAULT);
  useEffect(() => {
    try {
      setReelSettingsState(parseReel(localStorage.getItem(REEL_KEY)));
    } catch {
      // 保存が使えなくても初期値で動く
    }
  }, []);
  const setReelSettings = useCallback((v: ReelSettings) => {
    setReelSettingsState(v);
    try {
      localStorage.setItem(REEL_KEY, reelKeyValue(v));
    } catch {}
  }, []);
  // 並びと今の番号（残りの秒数は毎秒変わるので別に持ち、時計や見張りを作り直さない）
  const [reel, setReel] = useState<{ items: ReelItem[]; index: number } | null>(null);
  const [reelRemain, setReelRemain] = useState(0);
  const reelSeekAt = useRef(0);
  // scroll：始めたときだけ動画が見える所へ動かす。自動で次へ進むときは、チャットを読んでいても画面を動かさない
  const reelGo = useCallback(
    (items: ReelItem[], index: number, scroll: boolean) => {
      const it = items[index];
      reelSeekAt.current = Date.now();
      if (scroll) seek(it.start);
      else player.current?.seek(it.start);
      setReel({ items, index });
      setReelRemain(it.end - it.start);
    },
    [seek],
  );
  const durationSec = reelDurationSec(
    state.kind === "job" ? state.job.result?.lastBucketSec : undefined,
  );
  const startReel = useCallback(() => {
    const items = reelPlan(peaks, reelSettings, lead, durationSec);
    if (items.length > 0) reelGo(items, 0, true);
  }, [peaks, reelSettings, lead, durationSec, reelGo]);
  const stopReel = useCallback(() => setReel(null), []);
  // 目次の山が変わったら（絞り込み・グラフに出す数を変えた）、番号がずれるので止める
  // biome-ignore lint/correctness/useExhaustiveDependencies: peaks が変わったことだけを合図にする
  useEffect(() => {
    setReel(null);
  }, [peaks]);
  useEffect(() => {
    if (!reel) return;
    const timer = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const st = reelStep(
        reel.items,
        reel.index,
        p.getTime(),
        Date.now() - reelSeekAt.current,
        p.isEnded(),
      );
      if (st.kind === "stay") setReelRemain(st.remain);
      else if (st.kind === "next") reelGo(reel.items, st.index, false);
      else if (st.kind === "done") {
        // 最後の見どころの終わりで止める
        p.pause();
        setReel(null);
        pushNote("見どころを最後まで再生しました");
      } else {
        setReel(null);
        pushNote("見どころ再生を止めました");
      }
    }, 500);
    return () => clearInterval(timer);
  }, [reel, reelGo, pushNote]);
  const reelNow: ReelNow | null = reel
    ? {
        index: reel.index,
        count: reel.items.length,
        peakSec: reel.items[reel.index].peakSec,
        remain: reelRemain,
      }
    : null;
  const reelMove = (d: -1 | 1) => {
    if (!reel) return;
    const to = reel.index + d;
    if (to >= 0 && to < reel.items.length) reelGo(reel.items, to, false);
  };
  const chartReel: ChartReel = reel
    ? {
        window: { start: reel.items[reel.index].start, end: reel.items[reel.index].end },
        played: reel.items.slice(0, reel.index).map((x) => ({ start: x.start, end: x.end })),
        marks: reel.items.map((x, i) => ({
          sec: x.peakSec,
          n: x.n,
          state: i < reel.index ? "done" : i === reel.index ? "now" : "todo",
        })),
        onPick: (n) => reelGo(reel.items, n, false),
      }
    : {
        window: null,
        played: [],
        marks: peaks.map((p, n) => ({ sec: p.startSec, n, state: "todo" })),
        onPick: (n) => {
          const p = peaks[n];
          if (p) seekPeak(p.startSec);
        },
      };
  // スマホでグラフが画面の外に出たら、下に同じ操作の列を出す
  const chartBox = useRef<HTMLElement>(null);
  const [chartSeen, setChartSeen] = useState(true);
  const reeling = reel !== null;
  useEffect(() => {
    const el = chartBox.current;
    if (!reeling || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setChartSeen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [reeling]);
  // 山の名札（#62）：「すべて」と「反応」で、目次の山のいちばん多い反応。種類を選んでいるときはその種類の山だけ。
  const reactBySec = useMemo(
    () => new Map((reactRows ?? []).map((r) => [r.startSec, r])),
    [reactRows],
  );
  const showTags = (series === "all" || reactions) && reactRows !== null;
  const tagOf = (sec: number) => (showTags ? dominantReaction(reactBySec.get(sec)) : null);
  const chartTags = showTags
    ? peaks
        .map((p) => ({ sec: p.startSec, kind: tagOf(p.startSec) }))
        .filter(
          (t): t is { sec: number; kind: ReactionKey } =>
            t.kind !== null && (!reactFocus || t.kind === reactFocus),
        )
    : [];
  // 積み上げは、反応の数と棒の数（絞り込み中は絞り込んだ数）が両方そろってから
  const reactReady = reactions && reactRows !== null && (!recount || filtered !== null);
  const reactTotals = useMemo(() => (reactRows ? reactionTotals(reactRows) : null), [reactRows]);
  const reelStart = peaks.length > 0 && (
    <ReelStart
      settings={reelSettings}
      onSettings={setReelSettings}
      totalSec={reelTotalSec(peaks, reelSettings)}
      onStart={startReel}
    />
  );

  if (state.kind === "notfound") {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px" }}>
        <div style={card}>
          <p style={{ margin: "0 0 12px" }}>分析が見つかりません。</p>
          <Link href="/" style={backLink}>
            トップへ戻る
          </Link>
        </div>
      </main>
    );
  }

  const job = state.kind === "job" ? state.job : null;
  const done = job?.status === "done" && job.result ? job : null;
  const waiting = !job || job.status === "queued" || job.status === "running";
  // チャットがない動画（#3 では no_chat の失敗）でも、動画は再生できるようにする。
  const noChatVideo =
    job?.status === "failed" && job.error?.code === "no_chat" && job.videoId ? job.videoId : null;

  const matched = filtered ? filtered.reduce((sum, b) => sum + b.count, 0) : null;
  const total = done?.result?.totalComments ?? 0;
  const lineColors = laugh
    ? ["var(--chart-3)", "var(--chart-4)"]
    : ["var(--chart-2)", "var(--chart-3)"];
  const keywordItems = terms.map((term, i) => ({
    term,
    color: lineColors[i],
    count: termData[term] ? termData[term].reduce((sum, b) => sum + b.count, 0) : null,
  }));
  const lines = keywordItems.flatMap((k) =>
    termData[k.term] ? [{ term: k.term, color: k.color, buckets: termData[k.term] }] : [],
  );

  const chartHeading = reactions
    ? "反応の種類（30秒ごと）"
    : users && filtered !== null
      ? "コメントした人数（30秒ごと）"
      : laugh && filtered !== null
        ? "笑いの数（30秒ごと）"
        : "コメント数（30秒ごと）";
  const chartBuckets =
    state.kind === "job" ? (recount && filtered ? filtered : state.buckets) : null;

  return (
    <main className="analysis" style={{ maxWidth: 1240, margin: "0 auto", padding: "16px" }}>
      <div className="analysis-url">
        <UrlForm />
      </div>

      {job?.status === "failed" && (
        <div style={{ ...card, marginTop: 16, borderColor: "var(--danger-line)" }}>
          <p style={{ margin: "0 0 8px", color: "var(--danger)", fontWeight: 700 }}>
            ⚠ 分析できませんでした
          </p>
          <p style={{ margin: "0 0 12px" }}>{job.error?.message ?? "原因が分かりません。"}</p>
          <Link href="/" style={backLink}>
            別の URL で分析し直す
          </Link>
          {job.retryAfterSec != null && (
            <ReanalyzeButton
              retryAfterSec={job.retryAfterSec}
              onConfirm={reanalyze}
              busy={reanalyzing}
            />
          )}
        </div>
      )}

      {noChatVideo && (
        <>
          <div ref={playerBox} style={{ marginTop: 16, scrollMarginTop: 8 }}>
            <Player ref={player} platform={job?.platform} videoId={noChatVideo} />
          </div>
          <section style={{ ...card, marginTop: 16 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>コメント数（30秒ごと）</h2>
            <BucketChart buckets={[]} onSeek={seekPeak} />
          </section>
        </>
      )}

      {job?.status !== "failed" && (
        <div className="analysis-grid">
          <div className="analysis-main">
            <section className="menu-host" style={{ ...card, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <h1 style={{ fontSize: 20, margin: "0 0 4px", flex: 1, overflowWrap: "anywhere" }}>
                  {done?.result?.title ?? (waiting ? "分析中…" : "")}
                </h1>
                {done?.result && (
                  <div style={{ margin: "-8px -8px 0 0" }}>
                    <ExportMenu
                      jobId={id}
                      title={done.result.title}
                      videoUrl={
                        done.platform === "twitch"
                          ? `https://www.twitch.tv/videos/${done.result.videoId}`
                          : `https://www.youtube.com/watch?v=${done.result.videoId}`
                      }
                      durationSec={(done.result.lastBucketSec ?? 0) + 30}
                      filterQuery={filterParams(filter).toString()}
                      filtering={filtering}
                      toc={pickPeaks(
                        (recount ? filtered : state.kind === "job" ? state.buckets : null) ?? [],
                      )}
                      unit={users ? "人" : "件"}
                      graph={
                        // 数が全部 0 のときはグラフも出ないので、保存もできない
                        chartBuckets?.some((b) => b.count > 0)
                          ? {
                              heading: chartHeading,
                              buckets: chartRange
                                ? chartBuckets.slice(chartRange.start, chartRange.end)
                                : chartBuckets,
                              combine: users && filtered !== null ? "max" : "sum",
                            }
                          : null
                      }
                      shareToken={shareToken === undefined ? (done.shareToken ?? null) : shareToken}
                      onShareToken={setShareToken}
                      onDone={pushNote}
                      onUndoable={pushNote}
                      onError={setToast}
                    />
                  </div>
                )}
              </div>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                {done?.result
                  ? `コメント ${done.result.totalComments.toLocaleString("ja-JP")} 件`
                  : job?.status === "queued"
                    ? "順番を待っています。前の分析が終わると始まります。"
                    : "チャットを取得して集計しています。長い配信では数分かかります。"}
              </p>
              {waiting && job?.progress && <FetchProgressBar progress={job.progress} />}
              {done && done.retryAfterSec != null && (
                <ReanalyzeButton
                  retryAfterSec={done.retryAfterSec}
                  onConfirm={reanalyze}
                  busy={reanalyzing}
                />
              )}
            </section>

            <div ref={playerBox} style={{ marginTop: 16, scrollMarginTop: 8 }}>
              {done?.result ? (
                <Player ref={player} platform={done.platform} videoId={done.result.videoId} />
              ) : (
                <div
                  aria-hidden
                  style={{
                    aspectRatio: "16 / 9",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius)",
                  }}
                />
              )}
            </div>

            <section ref={chartBox} style={{ ...card, marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <h2 style={{ fontSize: 16, margin: 0 }}>
                  {reel ? "見どころ再生中" : chartHeading}
                </h2>
                {reelNow && (
                  <div
                    style={{ marginLeft: "auto", display: "flex", minWidth: 0, flex: "1 1 18rem" }}
                  >
                    <ReelStatus
                      now={reelNow}
                      onPrev={() => reelMove(-1)}
                      onNext={() => reelMove(1)}
                      onStop={stopReel}
                    />
                  </div>
                )}
                {done?.result && !reel && (
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      gap: 8,
                    }}
                  >
                    {reelStart}
                    <Segmented
                      label="スパム（連投・長いコピペ）"
                      options={SPAM}
                      value={spamMode}
                      onChange={setSpamMode}
                    />
                    <Segmented
                      label="グラフに出す数"
                      options={SERIES}
                      value={series}
                      onChange={setSeries}
                    />
                  </div>
                )}
              </div>
              {/* 人数は区間ごとに数えるので足しても全体の人数にならない。合計は出さない。 */}
              {recount && !users && matched !== null && (
                <p
                  aria-live="polite"
                  style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}
                >
                  {filtering ? "絞り込み中：" : ""}
                  {spam ? "スパム除外・" : ""}
                  {laugh ? "笑い" : filtering ? "一致" : "数えた"} {matched.toLocaleString("ja-JP")}{" "}
                  / 全 {total.toLocaleString("ja-JP")} 件
                </p>
              )}
              {reactions && state.kind === "job" && state.buckets && !reactReady ? (
                // 反応の数がそろうまで、青い棒を「反応の種類」の見出しの下に出さない
                <div
                  role={reactError ? "alert" : "status"}
                  style={{
                    height: 162,
                    display: "grid",
                    placeItems: "center",
                    alignContent: "center",
                    gap: 8,
                    background: "var(--surface-2)",
                    borderRadius: 6,
                    color: "var(--muted)",
                    textAlign: "center",
                    padding: 12,
                  }}
                >
                  {reactError ? (
                    <>
                      <span style={{ color: "var(--text)" }}>
                        ⚠ 反応の種類を読み込めませんでした
                      </span>
                      <button
                        type="button"
                        onClick={() => setReactTry((n) => n + 1)}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          padding: "0 16px",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius)",
                          background: "var(--surface)",
                          color: "var(--text)",
                          font: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        もう一度
                      </button>
                    </>
                  ) : (
                    "反応の種類を数えています…"
                  )}
                </div>
              ) : state.kind === "job" && state.buckets ? (
                <BucketChart
                  key={id}
                  keyHint={!keysSeen}
                  buckets={recount && filtered ? filtered : state.buckets}
                  onRange={setChartRange}
                  onSeek={seekPeak}
                  getTime={getTime}
                  filtered={filtering && filtered !== null}
                  laugh={laugh && filtered !== null}
                  donations={donations}
                  users={users && filtered !== null}
                  pickRange={pickMode && tab === "clip"}
                  onPickRange={(a, b) =>
                    setPicked((p) => ({ start: a, end: b, n: (p?.n ?? 0) + 1 }))
                  }
                  mark={mark}
                  clips={cleanClips(done?.result?.clips)}
                  lines={lines}
                  reel={done?.result ? chartReel : undefined}
                  stack={
                    reactReady && reactRows ? { rows: reactRows, focus: reactFocus } : undefined
                  }
                  tags={chartTags}
                />
              ) : (
                <div
                  aria-hidden
                  style={{ height: 162, background: "var(--surface-2)", borderRadius: 6 }}
                />
              )}
              {reactions && (
                <ReactionChips totals={reactTotals} focus={reactFocus} onFocus={setReactFocus} />
              )}
              {done?.result && (
                <KeywordLines items={keywordItems} total={total} onChange={setTerms} />
              )}
            </section>

            {done?.result && (
              <PlaybackBar
                total={total}
                bucketCount={state.kind === "job" && state.buckets ? state.buckets.length : 0}
                getTime={getTime}
                onSeek={seek}
                lead={lead}
                onLead={setLead}
                onStep={setStepSec}
                enabled
              />
            )}

            {done?.result && (
              <section style={{ ...card, marginTop: 16 }}>
                <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>よくコメントした人</h2>
                <PeoplePanel jobId={id} onPick={pickAuthor} />
              </section>
            )}
          </div>
          {done?.result && (
            <aside ref={chatBox} className="analysis-chat" style={{ ...card, marginTop: 16 }}>
              <div
                role="tablist"
                aria-label="チャット・メモ・目次・範囲"
                style={{ display: "flex", gap: 8, marginBottom: 12 }}
              >
                {TABS.map(({ key: k, name }) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    id={`tab-${k}`}
                    aria-selected={tab === k}
                    aria-controls={`panel-${k}`}
                    tabIndex={tab === k ? 0 : -1}
                    onClick={() => setTab(k)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        const at = TABS.findIndex((t) => t.key === k);
                        const step = e.key === "ArrowRight" ? 1 : TABS.length - 1;
                        const next = TABS[(at + step) % TABS.length].key;
                        setTab(next);
                        document.getElementById(`tab-${next}`)?.focus();
                      }
                    }}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      // 札の名前は折り返さない（「チャッ／ト」にならないよう左右の余白を詰める。#114）
                      padding: "0 4px",
                      whiteSpace: "nowrap",
                      font: "inherit",
                      fontWeight: 700,
                      cursor: "pointer",
                      borderRadius: "var(--radius)",
                      border: `1px solid ${tab === k ? "var(--accent-line)" : "var(--line)"}`,
                      background: tab === k ? "var(--accent-weak)" : "var(--surface)",
                      color: tab === k ? "var(--accent-dark)" : "var(--text)",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="panel-chat"
                aria-labelledby="tab-chat"
                className="chat-list-wrap"
                hidden={tab !== "chat"}
              >
                <ChatList
                  jobId={id}
                  getTime={getTime}
                  onSeek={seek}
                  onFilter={onFilter}
                  onError={setToast}
                  hasDonations={donations.length > 0}
                  preset={preset ?? undefined}
                  top={
                    <SavedFilters
                      filter={filter}
                      terms={terms}
                      onApply={(s) => {
                        setPreset((p) => ({ filter: s.filter, n: (p?.n ?? 0) + 1 }));
                        setTerms(s.terms);
                      }}
                      onDone={pushNote}
                      onUndoable={pushNote}
                      onError={setToast}
                    />
                  }
                />
              </div>
              <div
                role="tabpanel"
                id="panel-memo"
                aria-labelledby="tab-memo"
                className="chat-list-wrap"
                hidden={tab !== "memo"}
              >
                <MemoPanel
                  jobId={id}
                  getTime={getTime}
                  onSeek={seek}
                  onError={setToast}
                  stampSignal={stampSignal}
                />
              </div>
              <div
                role="tabpanel"
                id="panel-toc"
                aria-labelledby="tab-toc"
                className="chat-list-wrap"
                hidden={tab !== "toc"}
              >
                {!reel && reelStart && <div style={{ marginBottom: 8 }}>{reelStart}</div>}
                <TocPanel
                  buckets={recount ? filtered : state.kind === "job" ? state.buckets : null}
                  laugh={laugh}
                  users={users}
                  getTime={getTime}
                  onSeek={seekPeak}
                  tagOf={tagOf}
                />
              </div>
              <div
                role="tabpanel"
                id="panel-clip"
                aria-labelledby="tab-clip"
                className="chat-list-wrap"
                hidden={tab !== "clip"}
              >
                <ClipPanel
                  jobId={id}
                  getTime={getTime}
                  onSeek={seek}
                  onError={setToast}
                  picked={picked}
                  onPickMode={setPickMode}
                  onMark={setMark}
                />
              </div>
            </aside>
          )}
        </div>
      )}
      {reelNow && !chartSeen && (
        <ReelMini
          now={reelNow}
          onPrev={() => reelMove(-1)}
          onNext={() => reelMove(1)}
          onStop={stopReel}
        />
      )}
      {/* 下の列が出ているときは、お知らせをその上に出す（基本 8-1） */}
      <div className={reelNow && !chartSeen ? "toast-stack above-reel-mini" : "toast-stack"}>
        {[...notes].reverse().map((n) => (
          <NoteToast key={n.id} note={n} onClose={closeNote} onUndo={undoNote} />
        ))}
        <Toast message={toast} onClose={closeToast} />
      </div>
    </main>
  );
}
