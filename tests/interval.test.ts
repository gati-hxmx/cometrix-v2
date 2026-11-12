import { expect, test } from "vitest";
import { pickInterval } from "../src/worker/interval";

test("空振りが続くと間隔が延び、10秒で止まる", () => {
  expect(pickInterval(0)).toBe(1000);
  expect(pickInterval(1)).toBe(1000);
  expect(pickInterval(3)).toBe(4000);
  expect(pickInterval(20)).toBe(10_000);
});
