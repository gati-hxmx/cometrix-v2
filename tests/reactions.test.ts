import { expect, test } from "vitest";
import {
  classifyReaction,
  dominantReaction,
  emptyReactionBucket,
  reactionName,
  reactionTotals,
  sharePercent,
} from "../src/lib/reactions";
import { REACTION_SAMPLES } from "./fixtures/reaction-samples";

test.each(REACTION_SAMPLES)("「%s」は %s", (text, kind) => {
  expect(classifyReaction(text)).toBe(kind);
});

test("種類の名前", () => {
  expect(reactionName("laugh")).toBe("笑い");
  expect(reactionName("god")).toBe("神");
  expect(reactionName("other")).toBe("そのほか");
});

test("区間でいちばん多い反応。少ない・割合が低いときは出さない", () => {
  const b = (o: Partial<ReturnType<typeof emptyReactionBucket>>) => ({
    ...emptyReactionBucket(0),
    ...o,
  });
  expect(dominantReaction(b({ laugh: 10, clap: 4, other: 20 }))).toBe("laugh");
  // そのほかがいちばん多くても、種類の中でいちばん多いもの
  expect(dominantReaction(b({ god: 5, other: 15 }))).toBe("god");
  // 3 件未満は出さない
  expect(dominantReaction(b({ cry: 2 }))).toBeNull();
  // 区間の 20% 未満は出さない
  expect(dominantReaction(b({ wow: 3, other: 20 }))).toBeNull();
  // 同数は並びの先
  expect(dominantReaction(b({ cute: 5, clap: 5 }))).toBe("clap");
  expect(dominantReaction(undefined)).toBeNull();
});

test("種類ごとの合計と割合", () => {
  const rows = [
    { ...emptyReactionBucket(0), laugh: 2, other: 1 },
    { ...emptyReactionBucket(30), laugh: 1, god: 4 },
  ];
  expect(reactionTotals(rows)).toEqual({
    laugh: 3,
    clap: 0,
    wow: 0,
    cute: 0,
    god: 4,
    cry: 0,
    other: 1,
  });
  expect(sharePercent(1135, 10000)).toBe(11);
  expect(sharePercent(1, 0)).toBe(0);
});
