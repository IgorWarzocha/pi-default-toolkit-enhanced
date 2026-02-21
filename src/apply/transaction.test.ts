import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { applyHunks } from "./index.js";
import { parsePatch } from "./parser.js";

async function mk(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "apply-transaction-"));
}

describe("apply transaction planning", () => {
  test("applies mixed create edit move delete operations", async () => {
    const cwd = await mk();
    await fs.writeFile(path.join(cwd, "edit.txt"), "old\n", "utf8");
    await fs.writeFile(path.join(cwd, "move.txt"), "mv\n", "utf8");
    await fs.writeFile(path.join(cwd, "delete.txt"), "gone\n", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Create File: create.txt",
      "+new",
      "*** Edit File: edit.txt",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+newer",
      "*** Move File: move.txt",
      "*** Move to: moved.txt",
      "*** Delete File: delete.txt",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.length).toBe(0);
    expect(await fs.readFile(path.join(cwd, "create.txt"), "utf8")).toBe("new\n");
    expect(await fs.readFile(path.join(cwd, "edit.txt"), "utf8")).toBe("newer\n");
    expect(await fs.readFile(path.join(cwd, "moved.txt"), "utf8")).toBe("mv\n");
    expect(await fs.access(path.join(cwd, "move.txt")).then(() => true).catch(() => false)).toBe(false);
    expect(await fs.access(path.join(cwd, "delete.txt")).then(() => true).catch(() => false)).toBe(false);
  });

  test("rolls back writes when commit phase fails", async () => {
    const cwd = await mk();
    await fs.writeFile(path.join(cwd, "orig.txt"), "base\n", "utf8");
    await fs.writeFile(path.join(cwd, "bad"), "x", "utf8");
    const patch = [
      "*** Begin Patch",
      "*** Create File: created.txt",
      "+hello",
      "*** Edit File: orig.txt",
      "*** Move to: bad/target.txt",
      "@@ -1,1 +1,1 @@",
      "-base",
      "+next",
      "*** End Patch",
    ].join("\n");
    const result = await applyHunks(cwd, parsePatch(patch));
    expect(result.failed.some((item) => item.path === "<commit>")).toBe(true);
    expect(await fs.access(path.join(cwd, "created.txt")).then(() => true).catch(() => false)).toBe(false);
    expect(await fs.readFile(path.join(cwd, "orig.txt"), "utf8")).toBe("base\n");
  });


});
