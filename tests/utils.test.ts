import { describe, expect, it } from "vitest";
import {
  formatTemplate,
  fmtLrcTime,
  fmtSplTime,
  guessTitleArtist,
  normalizeCookie,
  normalizeText,
  parseCookie,
  queryVariants,
  sanitizeFilename,
} from "../src/lib/utils";

describe("utils", () => {
  it("sanitizes Windows file names", () => {
    expect(sanitizeFilename('a/b:c*?"<>|')).toBe("a_b_c______");
    expect(sanitizeFilename("   ")).toBe("lyrics");
  });

  it("normalizes cookie headers and DevTools rows", () => {
    expect(normalizeCookie("Cookie: MUSIC_U=abc; os=pc")).toBe(
      "MUSIC_U=abc; os=pc",
    );
    expect(
      parseCookie("MUSIC_U\tabc\t.music.163.com\t/\nos\tpc\t.music.163.com\t/"),
    ).toEqual({ MUSIC_U: "abc", os: "pc" });
    expect(parseCookie('{"MUSIC_U":"abc","os":"pc"}')).toEqual({
      MUSIC_U: "abc",
      os: "pc",
    });
  });

  it("guesses title and artist from common filenames", () => {
    expect(guessTitleArtist("01 - 周杰伦 - 夜曲.mp3")).toEqual([
      "夜曲",
      "周杰伦",
    ]);
    expect(guessTitleArtist("夜曲.mp3")).toEqual(["夜曲", ""]);
  });

  it("normalizes Unicode, accents and templates", () => {
    expect(normalizeText("Ｈｅｌｌｏ！")).toBe("hello");
    expect(queryVariants("Duvet bôa")).toEqual(["Duvet bôa", "Duvet boa"]);
    expect(
      formatTemplate("{title} - {artist}", {
        title: "夜曲",
        artist: "周杰伦",
      }),
    ).toBe("夜曲 - 周杰伦");
  });

  it("formats lyric timestamps without minute rollover", () => {
    expect(fmtLrcTime(61_234)).toBe("01:01.23");
    expect(fmtLrcTime(59_999)).toBe("00:59.99");
    expect(fmtSplTime(59_999)).toBe("00:59.999");
  });
});
