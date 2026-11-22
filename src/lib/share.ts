import { parseVideoUrl } from "./youtube-url";

// 共有の受け先（#70）。アプリによって URL が url・text・title のどこに入るかが違う
// （Android の YouTube は text に「タイトル https://youtu.be/…」の形で入れる）ので、全部から探す。

type Params = Record<string, string | string[] | undefined>;

const URL_RE = /https?:\/\/[^\s"'<>]+/g;

/** 共有で受け取った値から、分析できる URL を1つ選ぶ。分析できる形がなければ最初の URL、URL がなければ null。 */
export function sharedUrl(params: Params): string | null {
  const values = ["url", "text", "title"].flatMap((k) => {
    const v = params[k];
    return (Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === "string");
  });
  const found = values.flatMap((v) => v.match(URL_RE) ?? []).slice(0, 10);
  if (found.length === 0) return null;
  return found.find((u) => parseVideoUrl(u).ok) ?? found[0];
}
