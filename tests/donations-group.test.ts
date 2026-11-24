import { expect, test } from "vitest";
import { type Donation, groupDonations, kindText } from "../src/lib/donations";

const d = (id: number, sec: number, extra: Partial<Donation> = {}): Donation => ({
  id,
  offsetMs: sec * 1000,
  author: `u${id}`,
  body: "",
  kind: "paid",
  amount: "¥500",
  ...extra,
});
const all = { bucketSec: 30, startBucket: 0, endBucket: 10, group: 1 };

test("同じ30秒の区間の投げ銭は1つの印にまとめ、飛び先は最初の時刻", () => {
  const marks = groupDonations([d(2, 40), d(1, 35), d(3, 100)], all);
  expect(marks.map((m) => [m.bar, m.sec, m.items.length])).toEqual([
    [1, 35, 2],
    [3, 100, 1],
  ]);
});

test("区間の境界：30秒ちょうどは次の区間", () => {
  expect(groupDonations([d(1, 29), d(2, 30)], all).map((m) => m.bar)).toEqual([0, 1]);
});

test("表示範囲の外・動画開始前は除く。拡大中は範囲の先頭から数える", () => {
  const marks = groupDonations([d(1, -5), d(2, 10), d(3, 95), d(4, 400)], {
    bucketSec: 30,
    startBucket: 2,
    endBucket: 5,
    group: 1,
  });
  expect(marks.map((m) => m.bar)).toEqual([1]);
});

test("棒が複数の区間をまとめているとき、同じ棒の印になる", () => {
  const marks = groupDonations([d(1, 5), d(2, 65)], { ...all, group: 3 });
  expect(marks).toHaveLength(1);
  expect(marks[0].items).toHaveLength(2);
});

test("0件なら印なし。金額がなければ種類だけの表示", () => {
  expect(groupDonations([], all)).toEqual([]);
  expect(kindText({ kind: "member", amount: null })).toBe("メンバー加入");
  expect(kindText({ kind: "bits", amount: "100 bits" })).toBe("ビッツ 100 bits");
});
