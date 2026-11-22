import { parseVideoUrl } from "./youtube-url";

// 共有の受け先（#70）。アプリによって URL が url・text・title のどこに入るかが違う
// （Android の YouTube は text に「タイトル https://youtu.be/…」の形で入れる）ので、全部から探す。

type Params = Record<string, string | string[] | undefined>;

// 全角のかっこ・句読点は URL に入らないものとして区切る（「見て（https://youtu.be/…）」）
const URL_RE = /https?:\/\/[^\s"'<>（）「」『』【】。、，！？]+/g;
// 文の終わりの記号は URL の一部にしない（「https://youtu.be/… .」「(https://…)」）
const TRAILING = /[.,;:!?)\]}]+$/;

/** 共有で受け取った値から、分析できる URL を1つ選ぶ。分析できる形がなければ最初の URL、URL がなければ null。 */
export function sharedUrl(params: Params): string | null {
  const values = ["url", "text", "title"].flatMap((k) => {
    const v = params[k];
    return (Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === "string");
  });
  const found = values
    .flatMap((v) => v.match(URL_RE) ?? [])
    .map((u) => u.replace(TRAILING, ""))
    .slice(0, 10);
  if (found.length === 0) return null;
  return found.find((u) => parseVideoUrl(u).ok) ?? found[0];
}
