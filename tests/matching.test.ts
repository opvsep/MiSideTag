import { describe, expect, it } from "vitest";
import {
  chooseAutomatic,
  finalizeMatch,
  preferredTopCandidate,
  rankCandidates,
  rankVariants,
  scoreCandidate,
} from "../src/lib/matching";
import type { LocalTrack, Song } from "../src/types";

function track(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    path: "music/song.mp3",
    title: "夜曲",
    artist: "周杰伦",
    album: "十一月的萧邦",
    durationMs: 226000,
    codec: "MP3",
    tagType: "ID3v2",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
    ...overrides,
  };
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    source: "qq",
    id: "qq-1",
    title: "夜曲",
    artists: ["周杰伦"],
    album: "十一月的萧邦",
    durationMs: 226000,
    coverUrl: "",
    ...overrides,
  };
}

describe("matching", () => {
  it("gives an exact match full confidence", () => {
    const candidate = scoreCandidate(track(), song());
    expect(candidate.score).toBe(100);
    expect(candidate.reliable).toBe(true);
  });

  it("does not auto-confirm a missing artist", () => {
    const candidate = scoreCandidate(track({ artist: "" }), song());
    expect(candidate.reliable).toBe(false);
  });

  it("matches translated title aliases and romanized artist aliases", () => {
    const candidate = scoreCandidate(
      track({
        title: "アイドル",
        artist: "YOASOBI",
        album: "",
        durationMs: 213000,
      }),
      song({
        title: "アイドル (偶像)",
        artists: ["YOASOBI（ヨアソビ）"],
        album: "アイドル (偶像)",
        durationMs: 213000,
      }),
    );
    expect(candidate.score).toBe(95);
    expect(candidate.reliable).toBe(true);
    expect(candidate.reasons).toContain("歌手一致");
  });

  it("does not confuse a different recording version with a title alias", () => {
    const candidate = scoreCandidate(
      track({
        title: "アイドル",
        artist: "YOASOBI",
        album: "",
        durationMs: 213000,
      }),
      song({
        title: "アイドル (Live)",
        artists: ["YOASOBI"],
        album: "アイドル (Live)",
        durationMs: 213000,
      }),
    );
    expect(candidate.score).toBeLessThan(80);
    expect(candidate.reliable).toBe(false);
  });

  it("treats cross-platform duplicates as the same recording", () => {
    const first = scoreCandidate(
      track(),
      song({ source: "netease", id: "ne-1" }),
    );
    const second = scoreCandidate(track(), song());
    expect(chooseAutomatic([first, second], "balanced")).not.toBeNull();
  });

  it("treats translated title aliases as the same recording across providers", () => {
    const first = scoreCandidate(
      track({
        title: "アイドル",
        artist: "YOASOBI",
        album: "",
        durationMs: 213000,
      }),
      song({
        source: "netease",
        id: "ne-alias",
        title: "アイドル (偶像)",
        artists: ["YOASOBI（ヨアソビ）"],
        album: "",
        durationMs: 213000,
      }),
    );
    const second = scoreCandidate(
      track({
        title: "アイドル",
        artist: "YOASOBI",
        album: "",
        durationMs: 213000,
      }),
      song({
        source: "qq",
        id: "qq-alias",
        title: "アイドル",
        artists: ["YOASOBI"],
        album: "",
        durationMs: 213000,
      }),
    );
    expect(chooseAutomatic([second, first], "balanced")).not.toBeNull();
  });

  it("ranks the exact result first", () => {
    const ranked = rankCandidates(track(), [
      song({ id: "1" }),
      song({ id: "2", title: "完全不同", artists: ["其他歌手"] }),
    ]);
    expect(ranked[0].song.title).toBe("夜曲");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("keeps candidates from both providers when the limit is small", () => {
    const ranked = rankVariants(
      track(),
      [
        song({ source: "netease", id: "ne-1" }),
        song({ source: "netease", id: "ne-2" }),
        song({ source: "qq", id: "qq-1" }),
      ],
      2,
    );
    expect(new Set(ranked.map((candidate) => candidate.song.source))).toEqual(
      new Set(["netease", "qq"]),
    );
  });

  it("selects the best score from the configured pairing platform", () => {
    const netease = {
      ...scoreCandidate(
        track(),
        song({ source: "netease", id: "ne-1" }),
      ),
      score: 95,
    };
    const qq = {
      ...scoreCandidate(track(), song({ source: "qq", id: "qq-1" })),
      score: 100,
    };
    const result = finalizeMatch(
      track(),
      [qq, netease],
      "balanced",
      [],
      "netease",
    );
    expect(result.selected?.song.source).toBe("netease");
    expect(preferredTopCandidate([qq, netease], "netease")?.song.source).toBe(
      "netease",
    );
  });
});
