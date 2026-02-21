import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { applyHunks, buildUniqueLineByContent, locate } from "./index.js";
import { parsePatch } from "./parser.js";
import type { EditFileChunk } from "./types.js";
import type { HealOptions } from "./healing.js";

const options: HealOptions = {
  offsetWindow: 10,
  globalScan: true,
  fuzz: 1,
};

function chunk(oldLine: string, newLine: string): EditFileChunk {
  return {
    oldLines: [oldLine],
    oldAnchors: [{ line: 2 }],
    newLines: [newLine],
    isEndOfFile: false,
  };
}

describe("apply healing determinism", () => {
  test("returns stable ambiguous candidate ordering", () => {
    const lines = ["x", "target", "y", "target", "z"];
    const value = chunk("target", "patched");
    const unique = buildUniqueLineByContent(lines);
    const run = () => {
      try {
        locate(lines, value, 1, unique, options);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    const first = run();
    const second = run();
    expect(first).toBe("AmbiguousApplyError: Non-unique candidate anchors at lines 2, 4.");
    expect(second).toBe(first);
  });

  test("classifies already applied outcomes consistently", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "apply-healing-"));
    const file = path.join(cwd, "a.txt");
    await fs.writeFile(file, "new\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: a.txt",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ].join("\n");
    const hunks = parsePatch(patch);
    const first = await applyHunks(cwd, hunks);
    const second = await applyHunks(cwd, hunks);
    expect(first.noops.some((item) => item.reason === "already_applied")).toBe(true);
    expect(second.noops.some((item) => item.reason === "already_applied")).toBe(true);
    const firstStatus = first.hunkResults.find((item) => item.path.endsWith("a.txt"));
    const secondStatus = second.hunkResults.find((item) => item.path.endsWith("a.txt"));
    expect(firstStatus?.status).toBe("already_applied");
    expect(secondStatus?.status).toBe("already_applied");
  });
});
