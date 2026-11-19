import { describe, expect, it } from "vitest";
import {
  normalizeMatchingConcurrency,
  runConcurrent,
} from "../src/lib/concurrency";

describe("matching concurrency", () => {
  it("clamps values to the supported 1-10 range", () => {
    expect(normalizeMatchingConcurrency(-3)).toBe(1);
    expect(normalizeMatchingConcurrency("7")).toBe(7);
    expect(normalizeMatchingConcurrency(10.4)).toBe(10);
    expect(normalizeMatchingConcurrency(22)).toBe(10);
    expect(normalizeMatchingConcurrency("not-a-number")).toBe(3);
  });

  it("runs multiple jobs without exceeding the configured limit", async () => {
    const items = Array.from({ length: 10 }, (_, index) => index);
    const visited: number[] = [];
    let active = 0;
    let peak = 0;

    await runConcurrent(items, 3, async (index) => {
      active += 1;
      peak = Math.max(peak, active);
      visited.push(index);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
    });

    expect(visited).toHaveLength(10);
    expect(new Set(visited).size).toBe(10);
    expect(peak).toBe(3);
  });

  it("stops assigning new jobs after cancellation", async () => {
    let stopped = false;
    let completed = 0;
    await runConcurrent(
      Array.from({ length: 20 }, (_, index) => index),
      2,
      async () => {
        completed += 1;
        if (completed === 2) stopped = true;
      },
      () => stopped,
    );
    expect(completed).toBe(2);
  });
});
