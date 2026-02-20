import { computeLineHash } from "../shared/hash.js";

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

console.log("--- Hash Investigation (Case Sensitive vs Insensitive) ---");
console.log("Content".padEnd(40) + " | Sens | Insens");
console.log("-".repeat(60));

let collisionsSens = 0;
let collisionsInsens = 0;
const seenSens = new Set();
const seenInsens = new Set();

for (const s of snippets) {
  const hSens = computeLineHash(s, false);
  const hIns = computeLineHash(s, true);
  
  if (seenSens.has(hSens)) collisionsSens++;
  if (seenInsens.has(hIns)) collisionsInsens++;
  
  seenSens.add(hSens);
  seenInsens.add(hIns);
  
  console.log(`${s.padEnd(40)} | ${hSens}   | ${hIns}`);
}

console.log("-".repeat(60));
console.log(`Collisions (Sensitive):   ${collisionsSens}`);
console.log(`Collisions (Insensitive): ${collisionsInsens}`);

