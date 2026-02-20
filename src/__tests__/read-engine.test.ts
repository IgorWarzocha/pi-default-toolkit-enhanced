import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { executeReadHash } from "../read/executor.js";

const FIXTURES = path.resolve(import.meta.dirname, "__fixtures__");

async function setup() {
  await mkdir(FIXTURES, { recursive: true });
  await writeFile(
    path.join(FIXTURES, "sample.ts"),
    [
      'import { foo } from "bar";',
      "",
      "export function hello() {",
      '  return "world";',
      "}",
      "",
      "export function goodbye() {",
      '  return "farewell";',
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(FIXTURES, "big.txt"),
    Array.from({ length: 500 }, (_, i) => `line ${i + 1} content here`).join("\n"),
  );
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex",
  );
  await writeFile(path.join(FIXTURES, "icon.png"), png);
}

async function teardown() {
  await rm(FIXTURES, { recursive: true, force: true });
}

test("read-engine", async (t) => {
  await setup();
  t.after(teardown);

  await t.test("normal read: all lines have LINE:HASH| prefix", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("[") || line === "") continue;
      assert.match(line, /^\d+:[0-9a-f]{2}\|/, `Line missing LINE:HASH| prefix: ${line}`);
    }
  });

  await t.test("normal read: empty lines get 00 sentinel hash", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const lines = text.split("\n");
    const emptyHashLines = lines.filter((l) => /^\d+:00\|$/.test(l));
    assert.ok(emptyHashLines.length >= 2, `Expected at least 2 empty-hash lines, got ${emptyHashLines.length}`);
  });

  await t.test("normal read: line numbers are correct", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const lines = text.split("\n");
    let expected = 1;
    for (const line of lines) {
      if (line.startsWith("[") || line === "") continue;
      const num = parseInt(line, 10);
      assert.strictEqual(num, expected, `Expected line ${expected}, got ${num}`);
      expected++;
    }
  });

  await t.test("normal read: hashes are deterministic", async () => {
    const r1 = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const r2 = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const t1 = r1.content[0].type === "text" ? r1.content[0].text : "";
    const t2 = r2.content[0].type === "text" ? r2.content[0].text : "";
    assert.strictEqual(t1, t2);
  });

  await t.test("normal read: offset/limit selects correct range", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", offset: 3, limit: 3 }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const lines = text.split("\n").filter((l) => /^\d+:[0-9a-f]{2}\|/.test(l));
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(parseInt(lines[0], 10), 3);
    assert.strictEqual(parseInt(lines[2], 10), 5);
  });

  await t.test("normal read: offset beyond EOF throws", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", offset: 999 }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /beyond end of file/);
    assert.ok(result.details.files[0].error);
  });

  await t.test("normal read: hashes are stateless across ranges", async () => {
    const full = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const partial = await executeReadHash(FIXTURES, [{ path: "sample.ts", offset: 3, limit: 1 }]);
    const fullText = full.content[0].type === "text" ? full.content[0].text : "";
    const partialText = partial.content[0].type === "text" ? partial.content[0].text : "";
    const fullLine3 = fullText.split("\n").find((l) => l.startsWith("3"));
    const partialLine3 = partialText.split("\n").find((l) => l.startsWith("3"));
    assert.strictEqual(fullLine3, partialLine3, "Hash for line 3 must be identical in full and partial reads");
  });

  await t.test("normal read: multi-file produces --- separators", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts" }, { path: "big.txt", limit: 2 }]);
    const texts = result.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text);
    const separators = texts.filter((t) => t.startsWith("--- ") && t.endsWith(" ---"));
    assert.strictEqual(separators.length, 2);
  });

  await t.test("normal read: truncation on large file", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "big.txt" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const detail = result.details.files[0];
    if (detail && "truncated" in detail && detail.truncated) {
      assert.match(text, /Use offset=/, "Truncated output must include continuation hint");
    }
  });

  await t.test("normal read: missing file returns error", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "nonexistent.ts" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /ERROR/);
    assert.ok(result.details.files[0].error);
  });

  await t.test("search: finds matches with LINE:HASH| prefix", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "function" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 2/);
    const hashLines = text.split("\n").filter((l) => /^\d+:[0-9a-f]{2}\|/.test(l));
    assert.strictEqual(hashLines.length, 2);
  });

  await t.test("search: context lines included with hashes", async () => {
    const result = await executeReadHash(FIXTURES, [
      { path: "sample.ts", search: "hello", contextBefore: 1, contextAfter: 1 },
    ]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const hashLines = text.split("\n").filter((l) => /^\d+:[0-9a-f]{2}\|/.test(l));
    assert.ok(hashLines.length >= 3, `Expected at least 3 lines (match + context), got ${hashLines.length}`);
  });

  await t.test("search: gap separator between non-contiguous matches", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "function" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.ok(text.includes("..."), "Expected '...' gap separator between non-contiguous matches");
  });

  await t.test("search: no matches returns zero", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "zzzznonexistent" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 0/);
  });

  await t.test("search: case-insensitive by default", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "FUNCTION" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 2/);
  });

  await t.test("search: case-sensitive when requested", async () => {
    const result = await executeReadHash(FIXTURES, [
      { path: "sample.ts", search: "FUNCTION", caseSensitive: true },
    ]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 0/);
  });

  await t.test("search: regex mode", async () => {
    const result = await executeReadHash(FIXTURES, [
      { path: "sample.ts", search: "return.*world", regex: true },
    ]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 1/);
  });

  await t.test("search: maxMatches caps results", async () => {
    const result = await executeReadHash(FIXTURES, [
      { path: "big.txt", search: "line", maxMatches: 3 },
    ]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /Matches: 3/);
  });

  await t.test("search: hashes match normal read hashes", async () => {
    const full = await executeReadHash(FIXTURES, [{ path: "sample.ts" }]);
    const searched = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "hello" }]);
    const fullText = full.content[0].type === "text" ? full.content[0].text : "";
    const searchText = searched.content[0].type === "text" ? searched.content[0].text : "";
    const fullLine3 = fullText.split("\n").find((l) => l.startsWith("3"));
    const searchLine3 = searchText.split("\n").filter((l) => /^\d+:[0-9a-f]{2}\|/.test(l)).find((l) => l.startsWith("3"));
    assert.strictEqual(fullLine3, searchLine3, "Search hash for line 3 must match full-read hash");
  });

  await t.test("search: details include match count", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "sample.ts", search: "function" }]);
    assert.strictEqual(result.details.files[0].matches, 2);
  });

  await t.test("image: returns image content", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "icon.png" }]);
    const types = result.content.map((c: { type: string }) => c.type);
    assert.ok(types.includes("image"), `Expected image content, got types: ${types}`);
  });

  await t.test("image: search on image throws", async () => {
    const result = await executeReadHash(FIXTURES, [{ path: "icon.png", search: "foo" }]);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /ERROR/);
  });
});
