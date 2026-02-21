import { describe, expect, test } from "bun:test";
import { parsePatch } from "./parser.js";
import { InvalidHunkError } from "./types.js";

describe("apply parser invariant hardening", () => {
  test("derives deterministic create edit move delete operations", () => {
    const patch = [
      "*** Begin Patch",
      "*** Create File: a.txt",
      "+hello",
      "*** Edit File: b.txt",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "*** Move File: c.txt",
      "*** Move to: d.txt",
      "*** Delete File: e.txt",
      "*** End Patch",
    ].join("\n");
    const hunks = parsePatch(patch);
    expect(hunks.length).toBe(4);
    expect(hunks[0].type).toBe("create");
    expect(hunks[1].type).toBe("edit");
    expect(hunks[2].type).toBe("move");
    expect(hunks[3].type).toBe("delete");
  });

  test("captures anchor offsets from prefixed edit lines", () => {
    const patch = [
      "*** Begin Patch",
      "*** Edit File: a.txt",
      "@@ -4,1 +4,1 @@",
      "-7: before",
      "+after",
      "*** End Patch",
    ].join("\n");
    const hunks = parsePatch(patch);
    if (hunks[0].type !== "edit") throw new Error("Expected edit hunk");
    const anchor = hunks[0].chunks[0].oldAnchors[0];
    expect(anchor.line).toBe(7);
    expect(anchor.offset).toBe(4);
  });

  test("rejects malformed file section header with PatchParseError code", () => {
    const patch = [
      "*** Begin Patch",
      "*** Edt File: a.txt",
      "@@",
      "-a",
      "+b",
      "*** End Patch",
    ].join("\n");
    try {
      parsePatch(patch);
      throw new Error("Expected parse failure");
    } catch (error) {
      if (!(error instanceof InvalidHunkError)) throw error;
      expect(error.code).toBe("PatchParseError");
      expect(error.lineNumber).toBe(2);
    }
  });

  test("rejects mismatched hunk counts with expected and actual payload", () => {
    const patch = [
      "*** Begin Patch",
      "*** Edit File: a.txt",
      "@@ -1,2 +1,1 @@",
      "-a",
      "+b",
      "*** End Patch",
    ].join("\n");
    try {
      parsePatch(patch);
      throw new Error("Expected parse failure");
    } catch (error) {
      if (!(error instanceof InvalidHunkError)) throw error;
      expect(error.expected?.join(" ")).toBe("-2 +1");
      expect(error.actual?.join(" ")).toBe("-1 +1");
    }
  });
});
