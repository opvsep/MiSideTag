import { describe, expect, it } from "vitest";
import { searchAll } from "../src/lib/providers";

const runNetwork = process.env.RUN_NETWORK === "1";

describe.skipIf(!runNetwork)("cover diagnostics", () => {
  it.each(["【Kokia】 Exec Cosmoflips", "EXEC_COSMOFLIPS/. 梦音茶糯"])(
    "reports usable covers for %s",
    async (query) => {
      const result = await searchAll(query, { source: "qq", limit: 10 });
      const rows = [];
      for (const song of result.songs) {
        let status = 0;
        let contentType = "";
        if (song.coverUrl) {
          const response = await fetch(song.coverUrl, {
            headers: { Referer: "https://y.qq.com/" },
          });
          status = response.status;
          contentType = response.headers.get("content-type") || "";
        }
        rows.push({
          title: song.title,
          id: song.id,
          albumMid: song.albumMid,
          coverUrl: song.coverUrl,
          status,
          contentType,
        });
      }
      console.log(query, JSON.stringify(rows, null, 2));
      expect(
        rows.every(
          (row) =>
            row.coverUrl &&
            row.status >= 200 &&
            row.status < 300 &&
            row.contentType.startsWith("image/"),
        ),
      ).toBe(true);
    },
    60_000,
  );
});
