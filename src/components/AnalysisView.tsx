"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bucket } from "../lib/chart";
import { EMPTY_FILTER, filterParams, isFiltering } from "../lib/chat-filter";
import { cleanClips } from "../lib/clips";
import { type FetchProgress, progressLabel, progressPercent } from "../lib/progress";
import { BucketChart } from "./BucketChart";
import { ChatList, type Filter } from "./ChatList";
import { MemoPanel } from "./MemoPanel";
import { PlaybackBar } from "./PlaybackBar";
import { ReanalyzeButton } from "./ReanalyzeButton";
import { Segmented } from "./Segmented";
import { Toast } from "./Toast";
import { TocPanel } from "./TocPanel";
import { TwitchPlayer } from "./TwitchPlayer";
import { UrlForm } from "./UrlForm";
import { type PlayerHandle, YoutubePlayer } from "./YoutubePlayer";

type Job = {
  status: "queued" | "running" | "done" | "failed";
  platform?: "youtube" | "twitch";
  videoId?: string | null;
  result?: { videoId: string; title: string; totalComments: number; clips?: unknown } | null;
  error?: { code: string; message: string } | null;
  progress?: FetchProgress | null;
  /** done／failed のとき、あと何秒で分析し直せるか（#99）。 */
  retryAfterSec?: number | null;
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
] as const;
type Tab = (typeof TABS)[number]["key"];
const SERIES = [
  { key: "all", name: "すべて" },
  { key: "laugh", name: "笑い" },
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

/** 配信元に合ったプレイヤー。どちらも同じ PlayerHandle（seek・getTime）を持つ。 */
function Player({
  platform,
  videoId,
  ref,
}: {
  platform?: "youtube" | "twitch";
  videoId: string;
  ref: React.Ref<PlayerHandle>;
}) {
  return platform === "twitch" ? (
    <TwitchPlayer ref={ref} videoId={videoId} />
  ) : (
    <YoutubePlayer ref={ref} videoId={videoId} />
  );
}

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
  // 分析し直したあとにポーリングを再開するための番号（#99）。
  const [reload, setReload] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);
  const router = useRouter();
  const player = useRef<PlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [tab, setTab] = useState<Tab>("chat");
  const [filtered, setFiltered] = useState<Bucket[] | null>(null);
  const [series, setSeries] = useState<"all" | "laugh">("all");
  const laugh = series === "laugh";
  const [spamMode, setSpamMode] = useState<"on" | "off">("on");
  const spam = spamMode === "on";
  const onFilter = useCallback((f: Filter) => setFilter(f), []);
  const getTime = useCallback(() => player.current?.getTime() ?? 0, []);
  const filtering = isFiltering(filter);
  const isDone = state.kind === "job" && state.job.status === "done";

  // 絞り込み中・笑いを選んだときは、一致したコメントの数でグラフを描き直す。
  const recount = filtering || laugh || spam;
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
              : filtering
                ? "絞り込んだグラフを読み込めませんでした。"
                : "グラフを読み込めませんでした。",
          ),
      );
    return () => {
      stale = true;
    };
  }, [filter, recount, laugh, spam, isDone, id, filtering]);

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

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    const box = playerBox.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight)
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

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
            <BucketChart buckets={[]} onSeek={seek} />
          </section>
        </>
      )}

      {job?.status !== "failed" && (
        <div className="analysis-grid">
          <div className="analysis-main">
            <section style={{ ...card, marginTop: 16 }}>
              <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>
                {done?.result?.title ?? (waiting ? "分析中…" : "")}
              </h1>
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

            <section style={{ ...card, marginTop: 16 }}>
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
                  {laugh && filtered !== null ? "笑いの数（30秒ごと）" : "コメント数（30秒ごと）"}
                </h2>
                {done?.result && (
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      gap: 8,
                    }}
                  >
                    <Segmented
                      label="スパム（連投・長いコピペ）"
                      options={SPAM}
                      value={spamMode}
                      onChange={setSpamMode}
                    />
                    <Segmented
                      label="グラフに出すコメント"
                      options={SERIES}
                      value={series}
                      onChange={setSeries}
                    />
                  </div>
                )}
              </div>
              {recount && matched !== null && (
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
              {state.kind === "job" && state.buckets ? (
                <BucketChart
                  key={id}
                  buckets={recount && filtered ? filtered : state.buckets}
                  onSeek={seek}
                  getTime={getTime}
                  filtered={filtering && filtered !== null}
                  laugh={laugh && filtered !== null}
                  clips={cleanClips(done?.result?.clips)}
                />
              ) : (
                <div
                  aria-hidden
                  style={{ height: 162, background: "var(--surface-2)", borderRadius: 6 }}
                />
              )}
            </section>

            {done?.result && (
              <PlaybackBar
                total={total}
                bucketCount={state.kind === "job" && state.buckets ? state.buckets.length : 0}
                getTime={getTime}
                onSeek={seek}
                enabled
              />
            )}
          </div>
          {done?.result && (
            <aside className="analysis-chat" style={{ ...card, marginTop: 16 }}>
              <div
                role="tablist"
                aria-label="チャット・メモ・目次"
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
                />
              </div>
              <div
                role="tabpanel"
                id="panel-memo"
                aria-labelledby="tab-memo"
                className="chat-list-wrap"
                hidden={tab !== "memo"}
              >
                <MemoPanel jobId={id} getTime={getTime} onSeek={seek} onError={setToast} />
              </div>
              <div
                role="tabpanel"
                id="panel-toc"
                aria-labelledby="tab-toc"
                className="chat-list-wrap"
                hidden={tab !== "toc"}
              >
                <TocPanel
                  buckets={recount ? filtered : state.kind === "job" ? state.buckets : null}
                  laugh={laugh}
                  getTime={getTime}
                  onSeek={seek}
                />
              </div>
            </aside>
          )}
        </div>
      )}
      <Toast message={toast} onClose={closeToast} />
    </main>
  );
}
