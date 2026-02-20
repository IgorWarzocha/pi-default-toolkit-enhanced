function normalizeUnicode(str) {
  return str.normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(
      /[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g,
      " ",
    )
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

function normalizeForHash(str, lowerCase = false) {
  const canon = normalizeUnicode(str);
  const content = lowerCase ? canon.toLowerCase() : canon;
  return content.replace(/\s+/g, "").replace(/\r/g, "");
}

function computeStringHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return hash >>> 0;
}

function toBase26(n) {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function computeLineHash(content, lowerCase = false) {
  const normalized = normalizeForHash(content, lowerCase);
  if (normalized === "") return "aaaa";
  const hash = computeStringHash(normalized);
  const truncated = hash % 456976; // 26^4
  return toBase26(truncated);
}

const snippets = [
  "const user = new User();",
  "const User = require('./user');",
  "function getUser() {",
  "function getuser() {",
  "export class UserProfile {",
  "export class userprofile {",
  "  if (isReady) {",
  "  if (isready) {",
  "import { State } from './types';",
  "import { state } from './types';",
];

console.log("--- Hashline Format Investigation (Base26 Hyper-Token-Efficient) ---");
console.log("Content".padEnd(40) + " | Hashline Format");
console.log("-".repeat(60));

let collisionsSens = 0;
const seenSens = new Set();

for (let i = 0; i < snippets.length; i++) {
  const s = snippets[i];
  const h = computeLineHash(s);
  const lineNo = i + 1;
  const formatted = `${lineNo}${h}| ${s}`;
  
  if (seenSens.has(h)) {
    collisionsSens++;
  } else {
    seenSens.add(h);
  }
  
  console.log(`${s.padEnd(40)} | ${formatted}`);
}

console.log("-".repeat(60));
console.log(`Collisions: ${collisionsSens}`);
