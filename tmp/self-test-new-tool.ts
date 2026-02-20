import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePatch } from "../src/apply/parser.js";
import { applyHunks } from "../src/apply/index.js";
import { executeReadHash } from "../src/read/executor.js";

function assert(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "pi-hash-new-tool-"));
  const addPatch = "*** Create File: a.txt\n+hello";
  const add = await applyHunks(cwd, parsePatch(addPatch));
  assert(add.created.length === 1, "add failed");
  const readA = await executeReadHash(cwd, [{ path: "a.txt" }]);
  const textA = readA.content[0].type === "text" ? readA.content[0].text : "";
  const anchor = textA.split("\n").find((line) => line.endsWith("|hello")) ?? "";
  const editPatch = `*** Edit File: a.txt\n${anchor}\nhello world\n${anchor}`;
  const edited = await applyHunks(cwd, parsePatch(editPatch));
  assert(edited.failed.length === 0, "edit failed");
  const final = await readFile(path.join(cwd, "a.txt"), "utf-8");
  assert(final.includes("hello world"), "replacement failed");
  const movePatch = "*** Move File: a.txt\n*** Move to: moved/a.txt";
  const moved = await applyHunks(cwd, parsePatch(movePatch));
  assert(moved.moved.length === 1, "move failed");
  assert(await exists(path.join(cwd, "moved/a.txt")), "move target missing");
  console.log("PASS: parser/apply/read self-test complete");
}

await run();
