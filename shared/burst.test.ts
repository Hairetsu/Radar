import { describe, expect, it } from "vitest";
import { normalizeBurstLimits } from "./burst";

describe("burst limits", () => {
  it("clamps invalid and over-limit operator controls", () => {
    expect(normalizeBurstLimits({ count: 999, concurrency: 99, delayMs: -50 })).toEqual({
      count: 50,
      concurrency: 5,
      delayMs: 0
    });
    expect(normalizeBurstLimits({ count: "bad", concurrency: 2.9, delayMs: 10.8 })).toEqual({
      count: 1,
      concurrency: 2,
      delayMs: 10
    });
  });
});
