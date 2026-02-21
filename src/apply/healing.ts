import type { ApplyHunkResult, ApplyNoop, EditFileChunk } from "./types.js";
import { normalizeIndent } from "../shared/normalize.js";

const CONFUSABLE_HYPHENS_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;

export function stripAllWhitespace(s: string): string {
  return s.replace(/\s+/g, "");
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

export function restoreIndentFromFirst(oldLines: string[], newLines: string[]): string[] {
  if (oldLines.length === 0 || newLines.length === 0) return newLines;
  const template = oldLines.find((line) => line.trim().length > 0) ?? oldLines[0];
  const templateIndent = leadingWhitespace(template);
  if (templateIndent.length === 0) return newLines;
  let changed = false;
  const out = new Array<string>(newLines.length);
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];
    if (line.length === 0 || leadingWhitespace(line).length > 0) {
      out[i] = line;
      continue;
    }
    out[i] = templateIndent + line;
    changed = true;
  }
  return changed ? out : newLines;
}

export type ReplaceOp = {
  start: number;
  oldLength: number;
  newLines: string[];
  relocatedBy: number;
  fuzzUsed: number;
};

export type HealOptions = {
  offsetWindow: number;
  globalScan: boolean;
  fuzz: number;
};

export type LocateResult = {
  start: number;
  relocatedBy: number;
  fuzzUsed: number;
};

function getRange(chunk: EditFileChunk, drift: number): { start: number; end: number } | null {
  if (chunk.oldAnchors.length < 2) return null;
  const firstBase = chunk.oldAnchors[0].line;
  const lastBase = chunk.oldAnchors[chunk.oldAnchors.length - 1].line;
  if (firstBase < 1 || lastBase < 1) return null;
  const first = firstBase + drift;
  const last = lastBase + drift;
  if (first < 1 || last < first) return null;
  const span = last - first + 1;
  if (span <= chunk.oldAnchors.length) return null;
  return { start: first - 1, end: last - 1 };
}

function matchesAt(lines: string[], start: number, block: string[]): boolean {
  if (start < 0) return false;
  if (start + block.length > lines.length) return false;
  for (let index = 0; index < block.length; index++) {
    if (normalizeIndent(lines[start + index]) !== normalizeIndent(block[index])) return false;
  }
  return true;
}

function hasOldMatch(lines: string[], oldLines: string[]): boolean {
  if (oldLines.length === 0) return false;
  const max = lines.length - oldLines.length;
  for (let start = 0; start <= max; start++) {
    if (matchesAt(lines, start, oldLines)) return true;
  }
  return false;
}

function detectAlreadyApplied(lines: string[], chunk: EditFileChunk, seed: number, options: HealOptions): LocateResult | null {
  if (chunk.newLines.length === 0) return null;
  const max = lines.length - chunk.newLines.length;
  if (max < 0) return null;
  const target = Math.max(0, Math.min(seed, max));
  const candidates: number[] = [];
  if (matchesAt(lines, target, chunk.newLines)) candidates.push(target);
  for (let delta = 1; delta <= options.offsetWindow; delta++) {
    const up = target + delta;
    const down = target - delta;
    if (up <= max && matchesAt(lines, up, chunk.newLines)) candidates.push(up);
    if (down >= 0 && matchesAt(lines, down, chunk.newLines)) candidates.push(down);
  }
  if (options.globalScan) {
    for (let start = 0; start <= max; start++) {
      if (candidates.includes(start)) continue;
      if (matchesAt(lines, start, chunk.newLines)) candidates.push(start);
    }
  }
  candidates.sort((lhs, rhs) => lhs - rhs);
  if (candidates.length !== 1) return null;
  if (hasOldMatch(lines, chunk.oldLines)) return null;
  const start = candidates[0];
  return { start, relocatedBy: start - seed, fuzzUsed: 0 };
}

export function computeReplacementsWithHealing(
  originalLines: string[],
  filePath: string,
  chunks: EditFileChunk[],
  noops: ApplyNoop[],
  hunkResults: ApplyHunkResult[],
  options: HealOptions,
  locateFn: (lines: string[], chunk: EditFileChunk, seed: number, uniqueLineByContent: Map<string, number>, options: HealOptions) => LocateResult,
  findContextFn: (lines: string[], context: string, start: number) => number,
  contextErrorFn: (lines: string[], pathText: string, context: string, seed: number) => Error,
  mismatchFn: (lines: string[], pathText: string, chunk: EditFileChunk) => Error,
  buildUniqueLineByContentFn: (lines: string[]) => Map<string, number>,
): ReplaceOp[] {
  const uniqueLineByContent = buildUniqueLineByContentFn(originalLines);
  const replacements: ReplaceOp[] = [];
  let drift = 0;
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const base = chunk.oldAnchors[0] && chunk.oldAnchors[0].line > 0 ? chunk.oldAnchors[0].line - 1 : 0;
    const shifted = base + drift;
    let seed = shifted;
    if (chunk.changeContext) {
      try {
        seed = findContextFn(originalLines, chunk.changeContext, Math.max(0, shifted));
      } catch {
        throw contextErrorFn(originalLines, filePath, chunk.changeContext, shifted);
      }
    }
    const range = getRange(chunk, drift);
    if (range) {
      if (range.end >= originalLines.length) throw mismatchFn(originalLines, filePath, chunk);
      const firstExpected = chunk.oldLines[0] ?? "";
      const lastExpected = chunk.oldLines[chunk.oldLines.length - 1] ?? "";
      const firstActual = originalLines[range.start] ?? "";
      const lastActual = originalLines[range.end] ?? "";
      if (normalizeIndent(firstActual) !== normalizeIndent(firstExpected) || normalizeIndent(lastActual) !== normalizeIndent(lastExpected)) {
        throw mismatchFn(originalLines, filePath, chunk);
      }
      const oldLength = range.end - range.start + 1;
      const rangeNew = [...chunk.newLines];
      replacements.push({ start: range.start, oldLength, newLines: rangeNew, relocatedBy: 0, fuzzUsed: 0 });
      hunkResults.push({ path: filePath, hunk: chunkIdx + 1, status: "applied", relocatedBy: 0, fuzzUsed: 0 });
      drift += rangeNew.length - oldLength;
      continue;
    }
    let locate: LocateResult;
    try {
      locate = locateFn(originalLines, chunk, seed, uniqueLineByContent, options);
    } catch (error) {
      const already = detectAlreadyApplied(originalLines, chunk, seed, options);
      if (already) {
        noops.push({ path: filePath, line: already.start + 1, reason: "already_applied" });
        hunkResults.push({ path: filePath, hunk: chunkIdx + 1, status: "already_applied", relocatedBy: already.relocatedBy, fuzzUsed: already.fuzzUsed });
        continue;
      }
      hunkResults.push({ path: filePath, hunk: chunkIdx + 1, status: "rejected", relocatedBy: 0, fuzzUsed: 0 });
      const message = error instanceof Error ? error.message : "";
      if (message.includes("AmbiguousApplyError")) throw error;
      throw mismatchFn(originalLines, filePath, chunk);
    }
    const start = locate.start;
    const origLines = originalLines.slice(start, start + chunk.oldLines.length);
    let newLines = [...chunk.newLines];

    if (locate.fuzzUsed > 0) {
      // Context lines (same stripped content in old and new): use file's exact bytes
      for (let i = 0; i < newLines.length; i++) {
        if (i < chunk.oldLines.length
            && i < origLines.length
            && stripAllWhitespace(chunk.oldLines[i]) === stripAllWhitespace(newLines[i])) {
          newLines[i] = origLines[i];
        }
      }
      // Non-context lines: attempt paired indent restoration
      const restored = restoreIndentForPairedReplacement(origLines, newLines);
      if (restored !== newLines) {
        newLines = restored;
      } else {
        // Fallback: inherit indent from first matched line
        newLines = restoreIndentFromFirst(origLines, newLines);
      }
    }

    if (origLines.join("\n") === newLines.join("\n")) {
      noops.push({ path: filePath, line: start + 1, reason: "Replacement identical to current content" });
      hunkResults.push({ path: filePath, hunk: chunkIdx + 1, status: "already_applied", relocatedBy: locate.relocatedBy, fuzzUsed: locate.fuzzUsed });
      continue;
    }
    replacements.push({ start, oldLength: chunk.oldLines.length, newLines, relocatedBy: locate.relocatedBy, fuzzUsed: locate.fuzzUsed });
    hunkResults.push({ path: filePath, hunk: chunkIdx + 1, status: "applied", relocatedBy: locate.relocatedBy, fuzzUsed: locate.fuzzUsed });
    drift += newLines.length - chunk.oldLines.length;
  }
  replacements.sort((lhs, rhs) => lhs.start - rhs.start);
  return replacements;
}

export { CONFUSABLE_HYPHENS_RE };
