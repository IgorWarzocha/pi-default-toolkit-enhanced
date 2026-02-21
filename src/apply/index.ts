import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Hunk, EditFileChunk, ApplySummary, ApplyHunkResult } from "./types.js";
import type { ApplyNoop } from "./types.js";
import { resolvePatchPath } from "./path-utils.js";
import { buildNumberedDiff } from "./render.js";
import { normalizeLine } from "../shared/normalize.js";
import { computeReplacementsWithHealing, type ReplaceOp, type HealOptions, type LocateResult } from "./healing.js";

type AnchorError = Error & {
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

const DEFAULT_HEAL_OPTIONS: HealOptions = {
  offsetWindow: 100,
  globalScan: true,
  fuzz: 1,
};

function sanitizeContext(context: string): string {
  return context.replace(/^\s*\d+:\s*/, "").replace(/^\s*\d+\|/, "");
}

function normalizeIndent(line: string): string {
  return line.replace(/\t/g, "    ").replace(/ {2,}/g, " ").trimEnd();
}

function prefixLine(line: number, content: string): string {
  return `${line}: ${content}`;
}

function findContext(lines: string[], context: string, start: number): number {
  const target = sanitizeContext(context);
  let index = Math.max(0, start);
  while (index < lines.length) {
    if (lines[index] === target) return index;
    index += 1;
  }
  const soft: number[] = [];
  index = Math.max(0, start);
  const softTarget = normalizeIndent(target);
  while (index < lines.length) {
    if (normalizeIndent(lines[index]) === softTarget) soft.push(index);
    index += 1;
  }
  if (soft.length === 1) return soft[0];
  if (soft.length > 1) throw new Error("AMBIGUOUS MATCH: You MUST provide more specific @@ context lines.");
  throw new Error(`Failed to find context '${target}'.`);
}

function contextError(lines: string[], pathText: string, context: string, seed: number): AnchorError {
  const start = Math.max(0, seed - 4);
  const stop = Math.min(lines.length, seed + 9);
  const sample: string[] = [];
  let index = start;
  while (index < stop) {
    sample.push(prefixLine(index + 1, lines[index]));
    index += 1;
  }
  const error = new Error(
    `CONTEXT ERROR: Cannot find @@ context in ${pathText}` +
      `\n` +
      `\nREQUIREMENT: The text after @@ MUST exist in the file.` +
      `\nContext provided: "${sanitizeContext(context).slice(0, 80)}"` +
      `\n` +
      `\nACTION REQUIRED:` +
      `\n1. Use an EXACT line from the file as @@ context` +
      `\n2. OR omit @@ entirely and rely on anchored ' ' / '-' lines` +
      `\n` +
      `\nCURRENT FILE STATE (use these lines for @@ context):`,
  ) as AnchorError;
  error.expected = [sanitizeContext(context)];
  error.actual = sample;
  error.suggest = `Use one of these lines for @@ context, or omit @@ and use anchored ' ' / '-' lines only.`;
  return error;
}

function linesEqual(fileLine: string, expected: string, soft: boolean): boolean {
  if (!soft) return fileLine === expected;
  return normalizeIndent(fileLine) === normalizeIndent(expected);
}

function matchChunkAt(lines: string[], chunk: EditFileChunk, start: number, soft: boolean): boolean {
  if (chunk.oldLines.length === 0) return true;
  if (start < 0 || start + chunk.oldLines.length > lines.length) return false;
  let index = 0;
  while (index < chunk.oldLines.length) {
    if (!linesEqual(lines[start + index], chunk.oldLines[index], soft)) return false;
    index += 1;
  }
  return true;
}

function clampSeed(seed: number, max: number): number {
  if (max <= 0) return 0;
  if (seed < 0) return 0;
  if (seed >= max) return max - 1;
  return seed;
}

function collectWindowCandidates(lines: string[], chunk: EditFileChunk, target: number, max: number, soft: boolean, window: number): number[] {
  const hits: number[] = [];
  if (matchChunkAt(lines, chunk, target, soft)) hits.push(target);
  for (let delta = 1; delta <= window; delta++) {
    const down = target - delta;
    const up = target + delta;
    if (down >= 0 && down < max && matchChunkAt(lines, chunk, down, soft)) hits.push(down);
    if (up >= 0 && up < max && matchChunkAt(lines, chunk, up, soft)) hits.push(up);
  }
  hits.sort((lhs, rhs) => lhs - rhs);
  return hits;
}

function collectGlobalCandidates(lines: string[], chunk: EditFileChunk, max: number, soft: boolean): number[] {
  const hits: number[] = [];
  for (let index = 0; index < max; index++) {
    if (matchChunkAt(lines, chunk, index, soft)) hits.push(index);
  }
  return hits;
}

function resolveCandidate(hits: number[], target: number, fuzzUsed: number): LocateResult {
  if (hits.length === 0) throw new Error("No anchor match found.");
  if (hits.length > 1) {
    const lines = hits.map((line) => `${line + 1}`).join(", ");
    throw new Error(`AmbiguousApplyError: Non-unique candidate anchors at lines ${lines}.`);
  }
  const start = hits[0];
  return { start, relocatedBy: start - target, fuzzUsed };
}

export function buildUniqueLineByContent(lines: string[]): Map<string, number> {
  const uniqueLineByContent = new Map<string, number>();
  const seenDuplicate = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const key = normalizeLine(lines[i], false);
    if (seenDuplicate.has(key)) continue;
    if (uniqueLineByContent.has(key)) {
      uniqueLineByContent.delete(key);
      seenDuplicate.add(key);
      continue;
    }
    uniqueLineByContent.set(key, i + 1);
  }
  return uniqueLineByContent;
}

export function locate(lines: string[], chunk: EditFileChunk, seed: number, uniqueLineByContent: Map<string, number>, options: HealOptions): LocateResult {
  if (chunk.oldLines.length === 0) {
    const start = Math.max(0, Math.min(seed, lines.length));
    return { start, relocatedBy: 0, fuzzUsed: 0 };
  }
  const max = Math.max(0, lines.length - chunk.oldLines.length + 1);
  if (chunk.isEndOfFile) {
    const eofStart = lines.length - chunk.oldLines.length;
    if (matchChunkAt(lines, chunk, eofStart, false)) return { start: eofStart, relocatedBy: eofStart - seed, fuzzUsed: 0 };
    if (options.fuzz > 0 && matchChunkAt(lines, chunk, eofStart, true)) return { start: eofStart, relocatedBy: eofStart - seed, fuzzUsed: 1 };
    throw new Error("EOF chunk did not match file tail.");
  }
  const firstAnchor = chunk.oldAnchors[0];
  const targetBase = firstAnchor && firstAnchor.line > 0 ? seed : 0;
  const target = clampSeed(targetBase, max);
  const exactWindow = collectWindowCandidates(lines, chunk, target, max, false, options.offsetWindow);
  if (exactWindow.length === 1) return resolveCandidate(exactWindow, target, 0);
  if (exactWindow.length > 1) return resolveCandidate(exactWindow, target, 0);
  const first = chunk.oldLines[0];
  if (first) {
    const relocated = uniqueLineByContent.get(normalizeLine(first, false));
    if (relocated !== undefined) {
      const candidate = relocated - 1;
      if (candidate >= 0 && candidate < max && matchChunkAt(lines, chunk, candidate, false)) {
        return { start: candidate, relocatedBy: candidate - target, fuzzUsed: 0 };
      }
      if (options.fuzz > 0 && candidate >= 0 && candidate < max && matchChunkAt(lines, chunk, candidate, true)) {
        return { start: candidate, relocatedBy: candidate - target, fuzzUsed: 1 };
      }
    }
  }
  if (options.globalScan) {
    const globalExact = collectGlobalCandidates(lines, chunk, max, false);
    if (globalExact.length === 1) return resolveCandidate(globalExact, target, 0);
    if (globalExact.length > 1) return resolveCandidate(globalExact, target, 0);
  }
  if (options.fuzz > 0) {
    const softWindow = collectWindowCandidates(lines, chunk, target, max, true, options.offsetWindow);
    if (softWindow.length === 1) return resolveCandidate(softWindow, target, 1);
    if (softWindow.length > 1) return resolveCandidate(softWindow, target, 1);
    if (options.globalScan) {
      const globalSoft = collectGlobalCandidates(lines, chunk, max, true);
      if (globalSoft.length === 1) return resolveCandidate(globalSoft, target, 1);
      if (globalSoft.length > 1) return resolveCandidate(globalSoft, target, 1);
    }
  }
  throw new Error("No anchor match found in configured healing search space.");
}

function applyReplacements(sourceLines: string[], replacements: ReplaceOp[]): string[] {
  const result = [...sourceLines];
  for (const replacement of [...replacements].sort((lhs, rhs) => rhs.start - lhs.start)) {
    result.splice(replacement.start, replacement.oldLength, ...replacement.newLines);
  }
  return result;
}

function collapseEmpty(lines: string[]): string[] {
  const out: string[] = [];
  let empty = false;
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (empty) continue;
      empty = true;
      out.push("");
      continue;
    }
    empty = false;
    out.push(line);
  }
  return out;
}

function anchorLines(lines: string[]): string[] {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    out.push(prefixLine(index + 1, lines[index]));
    index += 1;
  }
  return out;
}

function anchorsFromContent(content: string): string[] {
  return anchorLines(content.split("\n"));
}

function mismatch(lines: string[], pathText: string, chunk: EditFileChunk): AnchorError {
  const first = chunk.oldAnchors[0];
  if (!first) return new Error(`ANCHOR ERROR: No valid anchors provided for ${pathText}.`);
  const mismatchSet = new Set<number>();
  const outOfBounds: number[] = [];
  for (let i = 0; i < chunk.oldAnchors.length; i++) {
    const anchor = chunk.oldAnchors[i];
    if (anchor.line <= 0) continue;
    const lineIdx = anchor.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) {
      outOfBounds.push(anchor.line);
      continue;
    }
    if (!linesEqual(lines[lineIdx], chunk.oldLines[i], false)) mismatchSet.add(anchor.line);
  }

  let firstLineNum = first.line > 0 ? first.line : 0;
  if (firstLineNum <= 0 && chunk.oldLines.length > 0) {
    const firstOld = chunk.oldLines[0];
    const exact: number[] = [];
    const soft: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === firstOld) exact.push(i + 1);
      if (normalizeIndent(lines[i]) === normalizeIndent(firstOld)) soft.push(i + 1);
    }
    if (exact.length === 1) {
      firstLineNum = exact[0];
    } else if (soft.length === 1) {
      firstLineNum = soft[0];
    } else {
      firstLineNum = 1;
    }
  }

  const contextStart = Math.max(0, firstLineNum - 5);
  const contextEnd = Math.min(lines.length, firstLineNum + 10);
  const sample: string[] = [];
  for (let i = contextStart; i < contextEnd; i++) {
    sample.push(prefixLine(i + 1, lines[i]));
  }
  const expected: string[] = [];
  for (let i = 0; i < chunk.oldLines.length; i++) {
    const anchor = chunk.oldAnchors[i];
    expected.push(anchor.line > 0 ? prefixLine(anchor.line, chunk.oldLines[i]) : chunk.oldLines[i]);
  }
  const messageLines: string[] = [];
  if (outOfBounds.length > 0) {
    messageLines.push(`LINE NUMBER ERROR: Line(s) ${outOfBounds.join(", ")} do not exist in ${pathText}.`);
    messageLines.push(`The file has ${lines.length} line(s). You MUST use line numbers within range 1-${lines.length}.`);
    messageLines.push("");
  }
  if (mismatchSet.size > 0) {
    messageLines.push(`MISMATCH: ${mismatchSet.size} line(s) differ from expectation.`);
    for (const lineNum of [...mismatchSet].sort((a, b) => a - b)) {
      const anchorIndex = chunk.oldAnchors.findIndex((anchor) => anchor.line === lineNum);
      const expectedLine = anchorIndex >= 0 ? (chunk.oldLines[anchorIndex] ?? "") : "";
      const actualLine = lines[lineNum - 1] ?? "";
      messageLines.push(`EXPECTED ${lineNum}: ${expectedLine}`);
      messageLines.push(`FOUND    ${lineNum}: ${actualLine}`);
      const normalizedExpected = normalizeLine(expectedLine, false);
      const normalizedActual = normalizeLine(actualLine, false);
      if (normalizedExpected === normalizedActual && expectedLine !== actualLine) {
        messageLines.push(`WHITESPACE MISMATCH at line ${lineNum}: content matches after normalization.`);
      }
    }
    messageLines.push("CURRENT FILE STATE:");
    const contextLines = new Set<number>();
    for (const lineNum of mismatchSet.keys()) {
      for (let i = Math.max(1, lineNum - 2); i <= Math.min(lines.length, lineNum + 2); i++) {
        contextLines.add(i);
      }
    }
    if (contextLines.size === 0) {
      for (let i = Math.max(1, firstLineNum - 1); i <= Math.min(lines.length, firstLineNum + 3); i++) {
        contextLines.add(i);
      }
    }
    const sortedContext = [...contextLines].sort((a, b) => a - b);
    let prevLine = 0;
    for (const lineNum of sortedContext) {
      if (prevLine > 0 && lineNum > prevLine + 1) messageLines.push("  ...");
      prevLine = lineNum;
      const content = lines[lineNum - 1] ?? "";
      const prefix = prefixLine(lineNum, content);
      if (mismatchSet.has(lineNum)) messageLines.push(`> ${prefix}`);
      else messageLines.push(`  ${prefix}`);
    }
  }
  if (messageLines.length === 0) {
    messageLines.push(`PATCH ERROR: Failed to locate the expected block in ${pathText}.`);
    messageLines.push(`LAST TARGET LINE: ${firstLineNum}`);
    messageLines.push("You MUST copy exact lines from CURRENT FILE STATE.");
  }
  const error = new Error(`PATCH FAILED:\n` + messageLines.join("\n")) as AnchorError;
  error.expected = expected;
  error.actual = sample;
  error.suggest = `Use exact lines from the CURRENT FILE STATE section above.`;
  return error;
}

async function deriveUpdatedContentWithHealing(
  originalContent: string,
  filePath: string,
  chunks: EditFileChunk[],
  noops: ApplyNoop[],
  hunkResults: ApplyHunkResult[],
  options: HealOptions,
): Promise<{ content: string; anchors: string[] }> {
  const originalLines = originalContent.split("\n");
  const replacements = computeReplacementsWithHealing(
    originalLines,
    filePath,
    chunks,
    noops,
    hunkResults,
    options,
    locate,
    findContext,
    contextError,
    mismatch,
    buildUniqueLineByContent,
  );
  const updatedLines = collapseEmpty(applyReplacements(originalLines, replacements));
  if (updatedLines[updatedLines.length - 1] !== "") updatedLines.push("");
  const content = updatedLines.join("\n");
  return { content, anchors: anchorLines(content.split("\n")) };
}

function upsertLive(summary: ApplySummary, pathText: string, anchors: string[]): void {
  let index = 0;
  while (index < summary.live.length) {
    if (summary.live[index].path === pathText) {
      summary.live[index] = { path: pathText, anchors };
      return;
    }
    index += 1;
  }
  summary.live.push({ path: pathText, anchors });
}



type PlannedWrite = {
  path: string;
  content: string;
};

type PlannedDelete = {
  path: string;
};

type PlannedCommit = {
  writes: PlannedWrite[];
  deletes: PlannedDelete[];
};

async function exists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

function failSummary(summary: ApplySummary, hunk: Hunk, error: unknown): ApplySummary {
  const typed = error as AnchorError;
  const message = error instanceof Error ? error.message : String(error);
  const failure = { path: hunk.filePath, error: message } as { path: string; error: string; expected?: string[]; actual?: string[]; suggest?: string };
  if (typed.expected && typed.expected.length > 0) failure.expected = typed.expected;
  if (typed.actual && typed.actual.length > 0) failure.actual = typed.actual;
  if (typed.suggest) failure.suggest = typed.suggest;
  summary.failed.push(failure);
  return summary;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

async function rollback(writesDone: string[], deletesDone: string[], backups: Map<string, string | undefined>): Promise<void> {
  for (let index = writesDone.length - 1; index >= 0; index--) {
    const filePath = writesDone[index];
    const backup = backups.get(filePath);
    if (backup === undefined) {
      try {
        await fs.unlink(filePath);
      } catch {
      }
      continue;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, backup, "utf-8");
  }
  for (let index = deletesDone.length - 1; index >= 0; index--) {
    const filePath = deletesDone[index];
    const backup = backups.get(filePath);
    if (backup === undefined) continue;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, backup, "utf-8");
  }
}

export async function applyHunks(cwd: string, hunks: Hunk[]): Promise<ApplySummary> {
  if (hunks.length === 0) throw new Error("No files were modified. You MUST include at least one file section in the patch.");
  const summary: ApplySummary = { created: [], edited: [], moved: [], deleted: [], failed: [], live: [], fileDiffs: [], noops: [], hunkResults: [] };
  const commit: PlannedCommit = { writes: [], deletes: [] };
  const scheduledWrite = new Set<string>();
  const scheduledDelete = new Set<string>();

  for (const hunk of hunks) {
    try {
      if (hunk.type === "create") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        if (await exists(target)) {
          throw new Error(`CONFLICT: File already exists: ${hunk.filePath}` + `\n\nREQUIREMENT: You MUST NOT use Create File to overwrite existing files.`);
        }
        if (scheduledWrite.has(target)) throw new Error(`CONFLICT: Multiple writes target '${hunk.filePath}'.`);
        scheduledWrite.add(target);
        commit.writes.push({ path: target, content: hunk.contents });
        summary.created.push(hunk.filePath);
        summary.fileDiffs.push({ status: "C", path: hunk.filePath, diff: buildNumberedDiff("", hunk.contents) });
        upsertLive(summary, hunk.filePath, anchorsFromContent(hunk.contents));
        continue;
      }
      if (hunk.type === "delete") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        const content = await readOptional(target);
        if (content === undefined) throw new Error(`CONFLICT: Delete source missing: ${hunk.filePath}`);
        if (scheduledDelete.has(target)) throw new Error(`CONFLICT: Duplicate delete target '${hunk.filePath}'.`);
        scheduledDelete.add(target);
        commit.deletes.push({ path: target });
        summary.deleted.push(hunk.filePath);
        summary.fileDiffs.push({ status: "D", path: hunk.filePath, diff: "" });
        continue;
      }
      if (hunk.type === "move") {
        const source = resolvePatchPath(cwd, hunk.filePath);
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        const sourceContent = await readOptional(source);
        if (sourceContent === undefined) throw new Error(`CONFLICT: Move source missing: ${hunk.filePath}`);
        const destinationExists = await exists(destination);
        if (destinationExists && !scheduledDelete.has(destination)) {
          throw new Error(`CONFLICT: Move destination already exists: ${hunk.moveToPath}`);
        }
        if (scheduledWrite.has(destination)) throw new Error(`CONFLICT: Multiple writes target '${hunk.moveToPath}'.`);
        if (scheduledDelete.has(source)) throw new Error(`CONFLICT: Move source already scheduled for delete: ${hunk.filePath}`);
        scheduledWrite.add(destination);
        scheduledDelete.add(source);
        commit.writes.push({ path: destination, content: sourceContent });
        commit.deletes.push({ path: source });
        summary.moved.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "MV", path: hunk.moveToPath, moveFrom: hunk.filePath, diff: "" });
        upsertLive(summary, hunk.moveToPath, anchorsFromContent(sourceContent));
        continue;
      }

      const source = resolvePatchPath(cwd, hunk.filePath);
      const originalContent = await readOptional(source);
      if (originalContent === undefined) throw new Error(`CONFLICT: Edit source missing: ${hunk.filePath}`);
      const next = await deriveUpdatedContentWithHealing(originalContent, source, hunk.chunks, summary.noops, summary.hunkResults, DEFAULT_HEAL_OPTIONS);
      const diff = buildNumberedDiff(originalContent, next.content);

      if (hunk.moveToPath) {
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        const destinationExists = await exists(destination);
        if (destinationExists && !scheduledDelete.has(destination)) {
          throw new Error(`CONFLICT: Edit destination already exists: ${hunk.moveToPath}`);
        }
        if (scheduledWrite.has(destination)) throw new Error(`CONFLICT: Multiple writes target '${hunk.moveToPath}'.`);
        if (scheduledDelete.has(source)) throw new Error(`CONFLICT: Edit source already scheduled for delete: ${hunk.filePath}`);
        scheduledWrite.add(destination);
        scheduledDelete.add(source);
        commit.writes.push({ path: destination, content: next.content });
        commit.deletes.push({ path: source });
        summary.edited.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "E", path: hunk.moveToPath, moveFrom: hunk.filePath, diff });
        upsertLive(summary, hunk.moveToPath, next.anchors);
        continue;
      }

      if (scheduledWrite.has(source)) throw new Error(`CONFLICT: Multiple writes target '${hunk.filePath}'.`);
      scheduledWrite.add(source);
      commit.writes.push({ path: source, content: next.content });
      summary.edited.push(hunk.filePath);
      summary.fileDiffs.push({ status: "E", path: hunk.filePath, diff });
      upsertLive(summary, hunk.filePath, next.anchors);
    } catch (error) {
      return failSummary(summary, hunk, error);
    }
  }

  const backups = new Map<string, string | undefined>();
  const touched = new Set<string>();
  for (const op of commit.writes) touched.add(op.path);
  for (const op of commit.deletes) touched.add(op.path);
  for (const filePath of touched) {
    backups.set(filePath, await readOptional(filePath));
  }

  const writesDone: string[] = [];
  const deletesDone: string[] = [];
  try {
    for (const op of commit.writes) {
      await fs.mkdir(path.dirname(op.path), { recursive: true });
      await fs.writeFile(op.path, op.content, "utf-8");
      writesDone.push(op.path);
    }
    for (const op of commit.deletes) {
      if (!(await exists(op.path))) continue;
      await fs.unlink(op.path);
      deletesDone.push(op.path);
    }
  } catch (error) {
    await rollback(writesDone, deletesDone, backups);
    const message = error instanceof Error ? error.message : String(error);
    summary.failed.push({ path: "<commit>", error: `TransactionError: ${message}` });
  }

  return summary;
}
