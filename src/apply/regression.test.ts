import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { applyHunks } from "./index.js";
import { parsePatch } from "./parser.js";

async function temp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "apply-regression-"));
}

describe("apply patch regressions", () => {
  test("insertion happens after matched context", async () => {
    const cwd = await temp();
    const file = path.join(cwd, "a.txt");
    await fs.writeFile(file, "one\ntwo\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: a.txt",
      "@@ two",
      "+three",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(file, "utf8")).toBe("one\ntwo\nthree\n");
  });

  test("multi-line context replacement matches consistently", async () => {
    const cwd = await temp();
    const file = path.join(cwd, "b.txt");
    await fs.writeFile(file, "a\nb\nc\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: b.txt",
      "@@",
      " a",
      " b",
      "-c",
      "+C",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(file, "utf8")).toBe("a\nb\nC\n");
  });

  test("tabs are preserved on unchanged and replacement lines", async () => {
    const cwd = await temp();
    const file = path.join(cwd, "c.txt");
    await fs.writeFile(file, "\talpha\n\tbeta\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: c.txt",
      "@@",
      " \talpha",
      "-\tbeta",
      "+\tgamma",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(file, "utf8")).toBe("\talpha\n\tgamma\n");
  });

  test("blank line context matching stays stable", async () => {
    const cwd = await temp();
    const file = path.join(cwd, "d.txt");
    await fs.writeFile(file, "a\n\n\nb\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: d.txt",
      "@@",
      " a",
      " ",
      " ",
      "-b",
      "+B",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(file, "utf8")).toBe("a\n\n\nB\n");
  });

  test("multiple edits to same file in one patch are applied", async () => {
    const cwd = await temp();
    const file = path.join(cwd, "e.txt");
    await fs.writeFile(file, "x\ny\nz\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Edit File: e.txt",
      "@@",
      "-x",
      "+X",
      "*** Edit File: e.txt",
      "@@",
      "-z",
      "+Z",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(file, "utf8")).toBe("X\ny\nZ\n");
  });
});
