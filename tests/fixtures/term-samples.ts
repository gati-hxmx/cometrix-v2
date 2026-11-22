/** 言葉の数え方の見本：[言葉, コメント, 含むか]。JS（term.test.ts）と Postgres（term.db.test.ts）で同じ結果になることを確かめる。 */
export const TERM_SAMPLES: [string, string, boolean][] = [
  ["lol", "LOL that was great", true],
  ["lol", "ｌｏｌ", true],
  ["www", "ｗｗｗ", true],
  ["kusa", "ＫＵＳＡ", true],
  ["草", "大草原", true],
  ["草", "くさ", false],
  [":face-with-tears-of-joy:", "最高 :face-with-tears-of-joy:", true],
  ["face-with-tears-of-joy", ":face-with-tears-of-joy:", true],
  ["pogchamp", "PogChamp PogChamp", true],
  ["pog", "こんにちは", false],
  ["ｗ", "w", true],
];
