import { describe, expect, it } from "vitest";
import { parseLrc } from "../src/lib/lyrics";
import { checkLyrics, reportStatus } from "../src/lib/quality";
import type { Song } from "../src/types";

const song: Song = {
  source: "qq",
  id: "1",
  title: "测试",
  artists: ["歌手"],
  album: "",
  durationMs: 180000,
  coverUrl: "",
};

describe("quality", () => {
  it("reports missing lyrics", () => {
    const report = checkLyrics(null);
    expect(reportStatus(report)).toBe("缺失");
  });

  it("reports an otherwise complete lyric", () => {
    const lyrics = parseLrc(
      [
        "[00:10.00]第一行歌词",
        "[00:25.00]第二行歌词",
        "[00:45.00]第三行歌词",
        "[01:05.00]第四行歌词",
        "[01:25.00]第五行歌词",
      ].join("\n"),
      { song },
    );
    const report = checkLyrics(lyrics, { expectedDurationMs: 180000 });
    expect(["通过", "需检查"]).toContain(reportStatus(report));
    expect(report.lines).toBe(5);
  });
});
