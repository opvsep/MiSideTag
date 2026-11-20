import { describe, expect, it } from "vitest";
import {
  extractHttpUrl,
  extractSongLinkIdentifiers,
} from "../src/lib/links";

describe("music share links", () => {
  it("extracts URLs from copied share text", () => {
    expect(
      extractHttpUrl(
        "分享单曲：Duvet https://y.music.163.com/m/song?id=3956911&userid=1。",
      ),
    ).toBe("https://y.music.163.com/m/song?id=3956911&userid=1");
  });

  it("recognizes Netease long and hash links", () => {
    expect(
      extractSongLinkIdentifiers(
        "https://music.163.com/#/song?id=3956911&foo=bar",
      ).neteaseId,
    ).toBe("3956911");
    expect(
      extractSongLinkIdentifiers(
        "https://y.music.163.com/m/song/3956911/?uct2=abc",
      ).neteaseId,
    ).toBe("3956911");
  });

  it("recognizes QQ song detail and playsong links", () => {
    expect(
      extractSongLinkIdentifiers(
        "https://y.qq.com/n/ryqq_v2/songDetail/000UWqii116Dg9",
      ).qqMid,
    ).toBe("000UWqii116Dg9");
    expect(
      extractSongLinkIdentifiers(
        "分享歌曲 https://i.y.qq.com/v8/playsong.html?songmid=002r5oUz2VI3TT&source=qq",
      ).qqMid,
    ).toBe("002r5oUz2VI3TT");
    expect(
      extractSongLinkIdentifiers(
        "https://i.y.qq.com/v8/playsong.html?songid=108363223&source=qq",
      ).qqNumericId,
    ).toBe("108363223");
  });

  it("recognizes IDs from redirected page text", () => {
    expect(
      extractSongLinkIdentifiers(
        'https://y.qq.com/n/ryqq/songDetail/00367xJN0gRPnV{"songMid":"00367xJN0gRPnV"}',
      ).qqMid,
    ).toBe("00367xJN0gRPnV");
  });

  it("distinguishes numeric QQ song details from songmid routes", () => {
    expect(
      extractSongLinkIdentifiers(
        "https://y.qq.com/n/ryqq_v2/songDetail/108363223?ADTAG=h5_play_song",
      ).qqNumericId,
    ).toBe("108363223");
  });
});
