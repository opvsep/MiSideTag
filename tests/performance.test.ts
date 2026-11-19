import { afterEach, describe, expect, it } from "vitest";
import {
  configureHighPerformance,
  providerConcurrencyLimit,
  withProviderConcurrency,
} from "../src/lib/performance";

afterEach(() => configureHighPerformance(false));

describe("provider performance profile", () => {
  it("raises provider limits in high-performance mode", () => {
    configureHighPerformance(false);
    expect(providerConcurrencyLimit("netease")).toBe(2);
    expect(providerConcurrencyLimit("qq")).toBe(8);

    configureHighPerformance(true);
    expect(providerConcurrencyLimit("netease")).toBe(5);
    expect(providerConcurrencyLimit("qq")).toBe(16);
  });

  it("never exceeds the active provider limit", async () => {
    configureHighPerformance(false);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        withProviderConcurrency("netease", async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 8));
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
