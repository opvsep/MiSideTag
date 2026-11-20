import { describe, expect, it } from "vitest";
import { resolveSongLink } from "../src/lib/providers";

const runNetwork = process.env.RUN_NETWORK === "1";

describe.skipIf(!runNetwork)("music link resolution", () => {
  it(
    "resolves a Netease song from copied share text",
    async () => {
      const song = await resolveSongLink(
        "分享单曲：Duvet https://music.163.com/#/song?id=3956911&userid=1",
      );
      expect(song?.source).toBe("netease");
      expect(song?.id).toBe("3956911");
      expect(song?.title).toBe("Duvet");
    },
    30_000,
  );

  it(
    "resolves a QQ playsong link",
    async () => {
      const song = await resolveSongLink(
        "分享歌曲 https://i.y.qq.com/v8/playsong.html?songmid=000UWqii116Dg9&source=qq",
      );
      expect(song?.source).toBe("qq");
      expect(song?.mid).toBe("000UWqii116Dg9");
      expect(song?.title).toBeTruthy();
    },
    30_000,
  );

  it(
    "resolves the provided QQ short share link",
    async () => {
      const song = await resolveSongLink(
        "https://c6.y.qq.com/base/fcgi-bin/u?__=YzHdUgxf0r0N",
      );
      expect(song?.source).toBe("qq");
      expect(song?.title).toBe("Duvet");
      expect(song?.mid).toBe("001OXeBs0IDw5V");
    },
    30_000,
  );
});
