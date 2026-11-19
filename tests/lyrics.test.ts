import { describe, expect, it } from "vitest";
import {
  formatLrc,
  mergeFieldByTime,
  parseLrc,
  parseQrc,
  parseYrc,
  translationTimes,
} from "../src/lib/lyrics";
import type { Song } from "../src/types";

const song: Song = {
  source: "netease",
  id: "1",
  title: "测试歌曲",
  artists: ["测试歌手"],
  album: "测试专辑",
  durationMs: 180000,
  coverUrl: "",
};

describe("lyrics", () => {
  it("parses standard LRC and repeated timestamps", () => {
    const lyrics = parseLrc(
      "[ti:测试]\n[00:01.00]第一行\n[00:02.50][00:03.00]重复行\n",
      { song },
    );
    expect(lyrics.lines).toHaveLength(3);
    expect(lyrics.lines[0].startMs).toBe(1000);
    expect(lyrics.lines[1].startMs).toBe(2500);
    expect(lyrics.lines[2].startMs).toBe(3000);
    expect(lyrics.wordLevel).toBe(false);
  });

  it("parses enhanced LRC word timings", () => {
    const lyrics = parseLrc("[00:01.00]<00:01.00>你<00:01.50>好\n", {
      song,
    });
    expect(lyrics.wordLevel).toBe(true);
    expect(lyrics.lines[0].text).toBe("你好");
    expect(lyrics.lines[0].words).toHaveLength(2);
    expect(lyrics.lines[0].words[1].startMs).toBe(1500);
  });

  it("parses YRC and QRC", () => {
    const yrc = parseYrc(
      "[0,1000](0,200,0)你(200,300,0)好\n[1000,500](1000,500,0)世界\n",
      song,
    );
    expect(yrc.lines.map((line) => line.text)).toEqual(["你好", "世界"]);

    const qrc = parseQrc(
      '<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricType="1" LyricContent="[ti:测试]\n[0,1200]你(0,300)好(300,300)\n[1200,800]世界(1200,300)" /></LyricInfo></QrcInfos>',
      song,
    );
    expect(qrc.lines.map((line) => line.text)).toEqual(["你好", "世界"]);
    expect(qrc.lines[0].endMs).toBe(1200);
  });

  it("merges translations by nearest timestamp", () => {
    const base = parseLrc("[00:01.00]hello\n[00:02.00]world\n", { song });
    const translated = parseLrc("[00:01.01]你好\n[00:02.05]世界\n", {
      song,
    });
    mergeFieldByTime(base, translated);
    expect(base.lines[0].translation).toBe("你好");
    expect(base.lines[1].translation).toBe("世界");
    expect(translationTimes("[00:01.00]你好\n").get(1000)).toBe("你好");
  });

  it("formats normal and SPL-compatible LRC", () => {
    const lyrics = parseLrc(
      "[00:01.00]<00:01.00>你<00:01.40>好\n",
      { song },
    );
    lyrics.lines[0].translation = "你好";
    const normal = formatLrc(lyrics, { includeTranslation: true });
    expect(normal).toContain("[ti:测试歌曲]");
    expect(normal).toContain("[00:01.00]你好");
    const enhanced = formatLrc(lyrics, { enhanced: true });
    expect(enhanced).toContain("[00:01.000]你<00:01.400>好");
    expect(enhanced).toContain("<00:01.520>");
  });
});
