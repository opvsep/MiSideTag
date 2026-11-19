import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../src/lib/config";

describe("config merging", () => {
  it("adds defaults for older config files", () => {
    const config = mergeConfig({
      saving: { writeLrc: true },
      matching: { prefer: "qq" },
    });
    expect(config.matching.concurrency).toBe(
      DEFAULT_CONFIG.matching.concurrency,
    );
    expect(config.performance.highPerformance).toBe(false);
  });

  it("validates concurrency and keeps the performance preference", () => {
    const config = mergeConfig({
      matching: { concurrency: 87 },
      performance: { highPerformance: true },
    });
    expect(config.matching.concurrency).toBe(10);
    expect(config.performance.highPerformance).toBe(true);
  });
});
