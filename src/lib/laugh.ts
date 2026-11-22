/**
 * 笑いのコメントの判定（#41）。DB（Postgres の `~*`）と画面・テスト（JS の RegExp "i"）で
 * 同じ文字列を使うため、両方で同じ意味になる書き方だけを使う（\b・先読み・\d は使わない）。
 *
 * 笑いとみなすもの：
 * - 「草」「笑」（爆笑・(笑) も含む）
 * - w・ｗ が2つ以上続く（ww・ｗｗｗ）
 * - 英字・数字のあとでない w・ｗ 1つでコメントが終わる（「それなw」「w」。show・1w は除く）
 * - 英字にはさまれない lol・lmao・lmfao、haha・hahaha…
 * - 😂・🤣・😆、YouTube の絵文字の名前（:face-with-tears-of-joy: など。区切りは - か _）
 */
export const LAUGH_PATTERN = [
  "草",
  "笑",
  "[wｗ]{2,}",
  "(^|[^a-z0-9])[wｗ]$",
  "(^|[^a-z])(lol|lmf?ao)([^a-z]|$)",
  "ha(ha)+",
  "😂",
  "🤣",
  "😆",
  "face.with.tears.of.joy",
  "rolling.on.the.floor.laughing",
].join("|");

/** 前後から除く空白：半角スペース・タブ・改行・全角スペース。DB の btrim にも同じ文字を渡す。 */
export const LAUGH_TRIM = " \t\r\n\u3000";

const re = new RegExp(LAUGH_PATTERN, "i");
const edges = /^[ \t\r\n\u3000]+|[ \t\r\n\u3000]+$/g;

/** コメントが笑いか。1つのコメントに何回あっても1件と数えるので真偽だけを返す。 */
export function isLaugh(text: string): boolean {
  return re.test(text.replace(edges, ""));
}
