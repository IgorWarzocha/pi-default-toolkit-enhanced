import type { ApplyNoop, EditFileChunk } from "./types.js";
import { computeLineHash } from "../shared/hash.js";

const CONFUSABLE_HYPHENS_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;

export function equalsIgnoringWhitespace(a: string, b: string): boolean {
  if (a === b) return true;
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

export function stripAllWhitespace(s: string): string {
  return s.replace(/\s+/g, "");
}

export function stripTrailingContinuationTokens(s: string): string {
  return s.replace(/(?:&&|\|\||\?\?|\?|:|=|,|\+|-|\*|\/|\.|\()\s*$/u, "");
}

export function stripMergeOperatorChars(s: string): string {
  return s.replace(/[|&?]/g, "");
}

export function leadingWhitespace(s: string): string {
  const match = s.match(/^\s*/);
  return match ? match[0] : "";
}

export function restoreLeadingIndent(templateLine: string, line: string): string {
  if (line.length === 0) return line;
  const templateIndent = leadingWhitespace(templateLine);
  if (templateIndent.length === 0) return line;
  const indent = leadingWhitespace(line);
  if (indent.length > 0) return line;
  return templateIndent + line;
}

export function normalizeConfusableHyphens(s: string): string {
  return s.replace(CONFUSABLE_HYPHENS_RE, "-");
}

export function normalizeConfusableHyphensInLines(lines: string[]): string[] {
  return lines.map(l => normalizeConfusableHyphens(l));
}

export function restoreIndentForPairedReplacement(oldLines: string[], newLines: string[]): string[] {
  if (oldLines.length !== newLines.length) return newLines;
  let changed = false;
  const out = new Array<string>(newLines.length);
  for (let i = 0; i < newLines.length; i++) {
    const restored = restoreLeadingIndent(oldLines[i], newLines[i]);
    out[i] = restored;
    if (restored !== newLines[i]) changed = true;
  }
  return changed ? out : newLines;
}

export function restoreOldWrappedLines(oldLines: string[], newLines: string[]): string[] {
  if (oldLines.length === 0 || newLines.length < 2) return newLines;
  const canonToOld = new Map<string, { line: string; count: number }>();
  for (const line of oldLines) {
    const canon = stripAllWhitespace(line);
    const bucket = canonToOld.get(canon);
    if (bucket) bucket.count++;
    else canonToOld.set(canon, { line, count: 1 });
  }
  const candidates: { start: number; len: number; replacement: string; canon: string }[] = [];
  for (let start = 0; start < newLines.length; start++) {
    for (let len = 2; len <= 10 && start + len <= newLines.length; len++) {
      const canonSpan = stripAllWhitespace(newLines.slice(start, start + len).join(""));
      const old = canonToOld.get(canonSpan);
      if (old && old.count === 1 && canonSpan.length >= 6) {
        candidates.push({ start, len, replacement: old.line, canon: canonSpan });
      }
    }
  }
  if (candidates.length === 0) return newLines;
  const canonCounts = new Map<string, number>();
  for (const c of candidates) {
    canonCounts.set(c.canon, (canonCounts.get(c.canon) ?? 0) + 1);
  }
  const uniqueCandidates = candidates.filter(c => (canonCounts.get(c.canon) ?? 0) === 1);
  if (uniqueCandidates.length === 0) return newLines;
  uniqueCandidates.sort((a, b) => b.start - a.start);
  const out = [...newLines];
  for (const c of uniqueCandidates) {
    out.splice(c.start, c.len, c.replacement);
  }
  return out;
}

export function stripRangeBoundaryEcho(fileLines: string[], startLine: number, endLine: number, dstLines: string[]): string[] {
  const count = endLine - startLine + 1;
  if (dstLines.length <= 1 || dstLines.length <= count) return dstLines;
  let out = dstLines;
  const beforeIdx = startLine - 2;
  if (beforeIdx >= 0 && equalsIgnoringWhitespace(out[0], fileLines[beforeIdx])) {
    out = out.slice(1);
  }
  const afterIdx = endLine;
  if (afterIdx < fileLines.length && out.length > 0 && equalsIgnoringWhitespace(out[out.length - 1], fileLines[afterIdx])) {
    out = out.slice(0, -1);
  }
  return out;
}

export function maybeExpandSingleLineMerge(
  fileLines: string[],
  line: number,
  dst: string[],
  explicitlyTouchedLines: Set<number>,
): { startLine: number; deleteCount: number; newLines: string[] } | null {
  if (dst.length !== 1) return null;
  if (line < 1 || line > fileLines.length) return null;
  const newLine = dst[0];
  const newCanon = stripAllWhitespace(newLine);
  const newCanonForMergeOps = stripMergeOperatorChars(newCanon);
  if (newCanon.length === 0) return null;
  const orig = fileLines[line - 1];
  const origCanon = stripAllWhitespace(orig);
  const origCanonForMatch = stripTrailingContinuationTokens(origCanon);
  const origCanonForMergeOps = stripMergeOperatorChars(origCanon);
  const origLooksLikeContinuation = origCanonForMatch.length < origCanon.length;
  if (origCanon.length === 0) return null;
  const nextIdx = line;
  const prevIdx = line - 2;
  if (origLooksLikeContinuation && nextIdx < fileLines.length && !explicitlyTouchedLines.has(line + 1)) {
    const next = fileLines[nextIdx];
    const nextCanon = stripAllWhitespace(next);
    const a = newCanon.indexOf(origCanonForMatch);
    const b = newCanon.indexOf(nextCanon);
    if (a !== -1 && b !== -1 && a < b && newCanon.length <= origCanon.length + nextCanon.length + 32) {
      return { startLine: line, deleteCount: 2, newLines: [newLine] };
    }
  }
  if (prevIdx >= 0 && !explicitlyTouchedLines.has(line - 1)) {
    const prev = fileLines[prevIdx];
    const prevCanon = stripAllWhitespace(prev);
    const prevCanonForMatch = stripTrailingContinuationTokens(prevCanon);
    const prevLooksLikeContinuation = prevCanonForMatch.length < prevCanon.length;
    if (!prevLooksLikeContinuation) return null;
    const a = newCanonForMergeOps.indexOf(stripMergeOperatorChars(prevCanonForMatch));
    const b = newCanonForMergeOps.indexOf(origCanonForMergeOps);
    if (a !== -1 && b !== -1 && a < b && newCanon.length <= prevCanon.length + origCanon.length + 32) {
      return { startLine: line - 1, deleteCount: 2, newLines: [newLine] };
    }
  }
  return null;
}

export type ReplaceOp = {
  start: number;
  oldLength: number;
  newLines: string[];
};

export function healChunkOverlaps(chunk: EditFileChunk): void {
const removalLines = new Set<number>();
const contextIndices = new Map<number, number>();
for (let i = 0; i < chunk.oldAnchors.length; i++) {
const anchor = chunk.oldAnchors[i];
if (i < chunk.newLines.length && chunk.oldLines[i] === chunk.newLines[i]) {
contextIndices.set(anchor.line, i);
} else {
removalLines.add(anchor.line);
}
}
const toRemove: number[] = [];
for (const lineNum of removalLines) {
const idx = contextIndices.get(lineNum);
if (idx !== undefined) toRemove.push(idx);
}
toRemove.sort((a, b) => b - a);
for (const idx of toRemove) {
chunk.oldLines.splice(idx, 1);
chunk.oldAnchors.splice(idx, 1);
chunk.newLines.splice(idx, 1);
}
}

export function computeReplacementsWithHealing(
  originalLines: string[],
  filePath: string,
  chunks: EditFileChunk[],
  noops: ApplyNoop[],
  locateFn: (lines: string[], chunk: EditFileChunk, seed: number, uniqueLineByHash: Map<string, number>) => number,
  findContextFn: (lines: string[], context: string, start: number) => number,
  contextErrorFn: (lines: string[], pathText: string, context: string, seed: number) => Error,
  mismatchFn: (lines: string[], pathText: string, chunk: EditFileChunk) => Error,
  buildUniqueLineByHashFn: (lines: string[]) => Map<string, number>,
): ReplaceOp[] {
  const uniqueLineByHash = buildUniqueLineByHashFn(originalLines);
  const replacements: ReplaceOp[] = [];
  const explicitlyTouchedLines = new Set<number>();
  for (const chunk of chunks) {
healChunkOverlaps(chunk);
    for (const anchor of chunk.oldAnchors) {
      explicitlyTouchedLines.add(anchor.line);
    }
  }
  let drift = 0;
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const base = chunk.oldAnchors[0] ? chunk.oldAnchors[0].line - 1 : originalLines.length;
    const shifted = base + drift;
    let seed = shifted;
    if (chunk.changeContext) {
      try {
        seed = findContextFn(originalLines, chunk.changeContext, Math.max(0, shifted));
      } catch {
      }
    }
    let start = seed;
    try {
      start = locateFn(originalLines, chunk, seed, uniqueLineByHash);
    } catch {
      throw mismatchFn(originalLines, filePath, chunk);
    }
    const origLines = originalLines.slice(start, start + chunk.oldLines.length);
    let newLines = [...chunk.newLines];
    const merged = maybeExpandSingleLineMerge(originalLines, start + 1, newLines, explicitlyTouchedLines);
    if (merged) {
      const mergedOrigLines = originalLines.slice(merged.startLine - 1, merged.startLine - 1 + merged.deleteCount);
      let healedLines = restoreIndentForPairedReplacement([mergedOrigLines[0] ?? ""], merged.newLines);
      if (mergedOrigLines.join("\n") === healedLines.join("\n") && mergedOrigLines.some(l => CONFUSABLE_HYPHENS_RE.test(l))) {
        healedLines = normalizeConfusableHyphensInLines(healedLines);
      }
      if (mergedOrigLines.join("\n") === healedLines.join("\n")) {
        noops.push({ path: filePath, line: merged.startLine, reason: "Replacement identical to current content" });
      } else {
        replacements.push({ start: merged.startLine - 1, oldLength: merged.deleteCount, newLines: healedLines });
        drift += healedLines.length - merged.deleteCount;
      }
      continue;
    }
    newLines = stripRangeBoundaryEcho(originalLines, start + 1, start + chunk.oldLines.length, newLines);
    newLines = restoreOldWrappedLines(origLines, newLines);
    newLines = restoreIndentForPairedReplacement(origLines, newLines);
    if (origLines.join("\n") === newLines.join("\n") && origLines.some(l => CONFUSABLE_HYPHENS_RE.test(l))) {
      newLines = normalizeConfusableHyphensInLines(newLines);
    }
    if (origLines.join("\n") === newLines.join("\n")) {
      noops.push({ path: filePath, line: start + 1, reason: "Replacement identical to current content" });
      continue;
    }
    replacements.push({ start, oldLength: chunk.oldLines.length, newLines });
    drift += newLines.length - chunk.oldLines.length;
  }
  replacements.sort((lhs, rhs) => lhs.start - rhs.start);
  return replacements;
}

export { CONFUSABLE_HYPHENS_RE };
