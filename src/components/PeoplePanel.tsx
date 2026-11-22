"use client";
import { useEffect, useState } from "react";
import { exactUserTerm } from "../lib/chat-filter";
import { firstTimerText, type People } from "../lib/people";

/**
 * コメントした人（#64）。この配信でコメントが多い人の上位と、初めてコメントした人の数。
 * 名前を押すと、チャットをその人のコメントだけに絞る。
 */
export function PeoplePanel({
  jobId,
  onPick,
}: {
  jobId: string;
  /** term は絞り込みの語（"名前"）、author は表示する名前 */
  onPick: (term: string, author: string) => void;
}) {
  const [people, setPeople] = useState<People | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPeople(null);
    setFailed(false);
    fetch(`/api/jobs/${jobId}/people`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<People>) : Promise.reject(new Error())))
      .then((p) => alive && setPeople(p))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [jobId]);

  if (failed) {
    return (
      <p style={{ margin: 0, color: "var(--muted)" }}>
        コメントした人を読み込めませんでした。ページを開き直してください。
      </p>
    );
  }
  if (!people) {
    return (
      <div aria-hidden style={{ height: 120, background: "var(--surface-2)", borderRadius: 6 }} />
    );
  }
  if (people.top.length === 0) {
    return <p style={{ margin: 0, color: "var(--muted)" }}>コメントした人はいません</p>;
  }
  const first = firstTimerText(people);

  return (
    <>
      <p style={{ margin: "0 0 4px" }}>
        コメントした人 {people.authors.toLocaleString("ja-JP")} 人{first && `、${first}`}
      </p>
      <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
        {people.firstTimers &&
          `初めての人は、同じチャンネルの分析済みの前の配信（${people.firstTimers.pastJobs.toLocaleString("ja-JP")} 本）にコメントがなかった人。`}
        名前を押すと、チャットをその人のコメントだけにします
      </p>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 4,
        }}
      >
        {people.top.map((p, i) => {
          // 長すぎる名前は絞り込みの語に入らないので押せない
          const term = exactUserTerm(p.author);
          return (
            <li key={p.author}>
              <button
                type="button"
                disabled={term === null}
                title={p.author}
                onClick={() => term && onPick(term, p.author)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  minHeight: 44,
                  padding: "0 12px",
                  font: "inherit",
                  textAlign: "left",
                  cursor: term === null ? "default" : "pointer",
                  color: "var(--text)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ color: "var(--muted)", minWidth: 20 }}>{i + 1}</span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.author}
                </span>
                <span style={{ flexShrink: 0 }}>{p.count.toLocaleString("ja-JP")} 件</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
