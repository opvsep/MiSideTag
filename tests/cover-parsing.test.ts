import { describe, expect, it } from "vitest";
import { extractQqPageCover } from "../src/lib/providers";

describe("QQ cover page parsing", () => {
  it("reads an og:image meta tag", () => {
    const html =
      '<meta property="og:image" content="https://y.qq.com/music/photo_new/T062R300x300M000001tmCuJ1kzLMj.jpg">';
    expect(extractQqPageCover(html)).toBe(
      "https://y.qq.com/music/photo_new/T062R300x300M000001tmCuJ1kzLMj.jpg",
    );
  });

  it("reads a meta tag whose attributes are reversed", () => {
    const html =
      '<meta content="//y.qq.com/music/photo_new/T062R300x300M0000017peum3B1NsF.jpg" property="og:image">';
    expect(extractQqPageCover(html)).toBe(
      "https://y.qq.com/music/photo_new/T062R300x300M0000017peum3B1NsF.jpg",
    );
  });

  it("decodes the SSR cover field when og:image is absent", () => {
    const html =
      '"detail":{"title":"EXEC_COSMOFLIPS","picurl":"\\u002F\\u002Fy.qq.com\\u002Fmusic\\u002Fphoto_new\\u002FT062R300x300M0000017peum3B1NsF.jpg?max_age=2592000"}';
    expect(extractQqPageCover(html)).toBe(
      "https://y.qq.com/music/photo_new/T062R300x300M0000017peum3B1NsF.jpg?max_age=2592000",
    );
  });

  it("returns an empty string when the page has no cover", () => {
    expect(extractQqPageCover("<html><head></head></html>")).toBe("");
  });
});
