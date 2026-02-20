import { normalizeUnicode } from "../shared/normalize.js";
import { computeLineHash } from "../shared/hash.js";
import test from "node:test";
import assert from "node:assert";

test("Unicode Normalization", () => {
  assert.strictEqual(normalizeUnicode("“smart quotes”"), "'smart quotes'");
  assert.strictEqual(normalizeUnicode("em—dash"), "em-dash");
  // Hyper-robust tests
  assert.strictEqual(normalizeUnicode("e\u0301"), "\u00e9"); // NFD -> NFC
  assert.strictEqual(normalizeUnicode("zero\u200Bwidth"), "zerowidth");
  assert.strictEqual(normalizeUnicode("control\x07char"), "controlchar");
});

test("Whitespace Invariance", () => {
  const hash1 = computeLineHash("  const x = 10;  ");
  const hash2 = computeLineHash("const x=10;");
  assert.strictEqual(hash1, hash2);
});

test("Empty line hash", () => {
  assert.strictEqual(computeLineHash("   "), "00");
});

test("Case sensitivity", () => {
  const hash1 = computeLineHash("function getUser()");
  const hash2 = computeLineHash("function getuser()");
  assert.notStrictEqual(hash1, hash2);
});
