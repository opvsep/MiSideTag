import { describe, expect, it } from "vitest";
import { decryptQrc, encryptQrc } from "qrc-decoder";

describe("qrc-decoder", () => {
  it("round-trips a QRC XML payload", () => {
    const payload =
      '<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricContent="[0,1000]你(0,300)好(300,300)" /></LyricInfo></QrcInfos>';
    expect(decryptQrc(encryptQrc(payload))).toBe(payload);
  });
});
