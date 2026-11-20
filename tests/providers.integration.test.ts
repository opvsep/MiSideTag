import { describe, expect, it } from "vitest";
import {
  fetchLyrics,
  fetchLyricsWithFallback,
  searchAll,
  searchQq,
} from "../src/lib/providers";

const runNetwork = process.env.RUN_NETWORK === "1";
const BOTH_PROVIDER_QUERY = "周杰伦 夜曲";

describe.skipIf(!runNetwork)("provider integration", () => {
  it(
    "searches both providers and fetches at least one lyric document",
    async () => {
      const result = await searchAll(BOTH_PROVIDER_QUERY, { limit: 5 });
      expect(result.songs.length, result.warnings.join("\n")).toBeGreaterThan(0);
      expect(
        result.bySource.netease?.length,
        result.warnings.join("\n"),
      ).toBeGreaterThan(0);
      expect(
        result.bySource.qq?.length,
        result.warnings.join("\n"),
      ).toBeGreaterThan(0);
      expect(
        result.bySource.netease?.every((song) => /^https:\/\//.test(song.coverUrl)),
      ).toBe(true);
      expect(
        result.bySource.qq?.every((song) => /^https:\/\//.test(song.coverUrl)),
      ).toBe(true);

      const candidates = [
        result.bySource.netease?.[0],
        result.bySource.qq?.[0],
      ].filter(Boolean);
      let fetched = false;
      for (const song of candidates) {
        try {
          const lyrics = await fetchLyrics(song!);
          if (lyrics.lines.length > 0) {
            expect(lyrics.song.id).toBe(song!.id);
            fetched = true;
            break;
          }
        } catch {
          // Unofficial endpoints can intermittently reject one provider.
        }
      }
      expect(fetched).toBe(true);
    },
    45_000,
  );

  it(
    "fetches a QQ lyric document",
    async () => {
      const songs = await searchQq(BOTH_PROVIDER_QUERY, "", 3, 1);
      expect(songs.length).toBeGreaterThan(0);
      const lyrics = await fetchLyrics(songs[0]);
      expect(lyrics.lines.length).toBeGreaterThan(0);
      expect(lyrics.song.source).toBe("qq");
    },
    45_000,
  );

  it.each(["EXEC_COSMOFLIPS", "白夢の繭 Ricordando il passato"])(
    "fills covers and attempts lyrics for %s",
    async (query) => {
      const result = await searchAll(query, { limit: 8 });
      expect(result.songs.length).toBeGreaterThan(0);
      expect(
        result.songs.every((song) => /^https:\/\//.test(song.coverUrl)),
        JSON.stringify(
          result.songs
            .filter((song) => !/^https:\/\//.test(song.coverUrl))
            .map((song) => ({
              source: song.source,
              id: song.id,
              title: song.title,
              album: song.album,
            })),
        ) + "\n" + result.warnings.join("\n"),
      ).toBe(true);
      const firstBySource = [
        result.bySource.netease?.[0],
        result.bySource.qq?.[0],
      ].filter(Boolean);
      let lyricSuccesses = 0;
      for (const song of firstBySource) {
        try {
          const lyrics = await fetchLyrics(song!);
          if (lyrics.lines.length) lyricSuccesses += 1;
        } catch {
          // A platform can legitimately omit lyrics for a single release.
        }
      }
      expect(lyricSuccesses).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    "falls back to matching versions when the selected QQ result lacks lyrics",
    async () => {
      const result = await searchAll("【Kokia】 Exec Cosmoflips", {
        source: "qq",
        limit: 10,
      });
      expect(result.songs.length).toBeGreaterThan(0);
      const target =
        result.songs.find((song) => song.title.includes("Kokia")) ||
        result.songs[0];
      const lyrics = await fetchLyricsWithFallback(target, {});
      expect(lyrics.lines.some((line) => line.text.trim())).toBe(true);
      expect(lyrics.providerNote).toContain("备用匹配");
    },
    90_000,
  );
});
