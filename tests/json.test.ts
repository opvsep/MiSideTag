import { describe, expect, it } from "vitest";
import {
  array,
  numberValue,
  object,
  parseJson,
  stringValue,
} from "../src/lib/json";

describe("JSON helpers", () => {
  it("parses plain and JSONP responses", () => {
    expect(parseJson<{ code: number }>('{"code":200}')).toEqual({
      code: 200,
    });
    expect(parseJson<{ code: number }>("callback({\"code\":200});")).toEqual({
      code: 200,
    });
  });

  it("normalizes loose platform values", () => {
    expect(object([])).toBeNull();
    expect(object({ name: "song" })).toEqual({ name: "song" });
    expect(array("not-array")).toEqual([]);
    expect(stringValue(42)).toBe("42");
    expect(numberValue("42.5")).toBe(42.5);
    expect(numberValue("invalid")).toBe(0);
  });
});
