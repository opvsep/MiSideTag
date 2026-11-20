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

  it("ignores malformed values instead of corrupting defaults", () => {
    const config = mergeConfig({
      saving: {
        customDir: { invalid: true },
        template: 42,
        writeLrc: "yes",
        mode: "invalid",
      },
      matching: {
        prefer: "invalid",
        sensitivity: "extreme",
        autoFetchLyrics: "yes",
        concurrency: "not-a-number",
      },
      accounts: {
        netease: {
          nickname: 123,
          vip: "yes",
          valid: "yes",
        },
      },
    });
    expect(config.saving.mode).toBe(DEFAULT_CONFIG.saving.mode);
    expect(config.saving.template).toBe(DEFAULT_CONFIG.saving.template);
    expect(config.saving.writeLrc).toBe(DEFAULT_CONFIG.saving.writeLrc);
    expect(config.matching.prefer).toBe(DEFAULT_CONFIG.matching.prefer);
    expect(config.matching.sensitivity).toBe(
      DEFAULT_CONFIG.matching.sensitivity,
    );
    expect(config.matching.autoFetchLyrics).toBe(
      DEFAULT_CONFIG.matching.autoFetchLyrics,
    );
    expect(config.matching.concurrency).toBe(
      DEFAULT_CONFIG.matching.concurrency,
    );
    expect(config.accounts.netease.nickname).toBe("");
    expect(config.accounts.netease.vip).toBe(false);
    expect(config.accounts.netease.valid).toBeNull();
  });
});
