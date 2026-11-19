import { describe, expect, it } from "vitest";
import { parseNeteaseSearchPayload } from "../src/lib/providers";

describe("Netease search payload parsing", () => {
  it("parses the cloud search response shape", () => {
    const songs = parseNeteaseSearchPayload({
      code: 200,
      result: {
        songs: [
          {
            id: 3956911,
            name: "Duvet",
            dt: 203600,
            ar: [{ name: "Bôa" }],
            al: {
              name: "Twilight",
              picUrl:
                "http://p3.music.126.net/DVlINCT0lp5I_da7oKaUVg==/109951170485945191.jpg",
            },
          },
        ],
      },
    });

    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      source: "netease",
      id: "3956911",
      title: "Duvet",
      artists: ["Bôa"],
      album: "Twilight",
      durationMs: 203600,
    });
    expect(songs[0].coverUrl).toMatch(/^https:\/\/p3\.music\.126\.net\//);
  });

  it("parses the legacy search response shape", () => {
    const songs = parseNeteaseSearchPayload({
      code: 200,
      result: {
        songs: [
          {
            id: 3956911,
            name: "Duvet",
            duration: 203600,
            artists: [{ name: "Bôa" }],
            album: { name: "Twilight" },
          },
        ],
      },
    });

    expect(songs).toHaveLength(1);
    expect(songs[0].artists).toEqual(["Bôa"]);
    expect(songs[0].album).toBe("Twilight");
  });
});
