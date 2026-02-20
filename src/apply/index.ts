import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Hunk, EditFileChunk, ApplySummary } from "./types.js";
import type { ApplyNoop } from "./types.js";
import { resolvePatchPath } from "./path-utils.js";
import { buildNumberedDiff } from "./render.js";
import { normalizeForHash } from "../shared/normalize.js";
import { computeLineHash } from "../shared/hash.js";
import { computeReplacementsWithHealing, type ReplaceOp } from "./healing.js";
import { formatContent } from "./formatter.js";

type AnchorError = Error & {
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

function sanitizeContext(context: string): string {
  return context.replace(/^\d+:[a-f]{2}\|/, "");
}

function findContext(lines: string[], context: string, start: number): number {
  const target = sanitizeContext(context);
  let index = Math.max(0, start);
  while (index < lines.length) {
    if (normalizeForHash(lines[index], false) === normalizeForHash(target, false)) return index;
    index += 1;
  }
  throw new Error(`Failed to find context '${target}'.`);
}

function contextError(lines: string[], pathText: string, context: string, seed: number): AnchorError {
  const start = Math.max(0, seed - 4);
  const stop = Math.min(lines.length, seed + 9);
  const sample: string[] = [];
  let index = start;
  while (index < stop) {
    sample.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
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

function linesEqual(fileLine: string, expected: string, expectedHash: string): boolean {
  if (computeLineHash(fileLine) === expectedHash) return true;
  return normalizeForHash(fileLine, false) === normalizeForHash(expected, false);
}

function matchChunkAt(lines: string[], chunk: EditFileChunk, start: number): boolean {
  if (chunk.oldLines.length === 0) return true;
  if (start < 0 || start + chunk.oldLines.length > lines.length) return false;
  let index = 0;
  while (index < chunk.oldLines.length) {
    const fileLine = lines[start + index];
    const expected = chunk.oldLines[index];
    const anchor = chunk.oldAnchors[index];
    if (!linesEqual(fileLine, expected, anchor.hash)) return false;
    index += 1;
  }
  return true;
}

function spiral(seed: number, max: number): number[] {
  const out: number[] = [];
  if (seed >= 0 && seed < max) out.push(seed);
  let delta = 1;
  while (delta <= 100) {
    const up = seed + delta;
    const down = seed - delta;
    if (up >= 0 && up < max) out.push(up);
    if (down >= 0 && down < max) out.push(down);
    delta += 1;
  }
  return out;
}

function buildUniqueLineByHash(lines: string[]): Map<string, number> {
  const uniqueLineByHash = new Map<string, number>();
  const seenDuplicateHashes = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i]);
    if (seenDuplicateHashes.has(hash)) continue;
    if (uniqueLineByHash.has(hash)) {
      uniqueLineByHash.delete(hash);
      seenDuplicateHashes.add(hash);
    } else {
      uniqueLineByHash.set(hash, i + 1);
    }
  }
  return uniqueLineByHash;
}

function locate(
  lines: string[],
  chunk: EditFileChunk,
  seed: number,
  uniqueLineByHash: Map<string, number>,
): number {
  if (chunk.oldLines.length === 0) return Math.max(0, Math.min(seed, lines.length));
  const max = Math.max(0, lines.length - chunk.oldLines.length + 1);
  if (chunk.isEndOfFile) {
    const eofStart = lines.length - chunk.oldLines.length;
    if (matchChunkAt(lines, chunk, eofStart)) return eofStart;
    throw new Error("EOF chunk did not match file tail.");
  }
  const firstAnchor = chunk.oldAnchors[0];
  const target = firstAnchor ? seed : 0;
  if (target < 0 || target >= max) {
    throw new Error("Adjusted target is out of bounds.");
  }
  const candidates = spiral(target, max);
  const hits: number[] = [];
  for (const candidate of candidates) {
    if (matchChunkAt(lines, chunk, candidate)) hits.push(candidate);
  }
  if (hits.length === 0) {
    const firstAnchor = chunk.oldAnchors[0];
    if (firstAnchor) {
      const relocated = uniqueLineByHash.get(firstAnchor.hash);
      if (relocated !== undefined && matchChunkAt(lines, chunk, relocated - 1)) {
        return relocated - 1;
      }
    }
    throw new Error("No anchor match found in +/-100 spiral window.");
  }
  const best = hits[0];
  const bestDistance = Math.abs(best - target);
  const tie = hits.find((value, index) => index > 0 && Math.abs(value - target) === bestDistance);
  if (tie !== undefined) {
    throw new Error(`Equidistant anchor collision at lines ${best + 1} and ${tie + 1}.`);
  }
  return best;
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
    out.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
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

  const mismatchSet = new Map<number, { expected: string; actual: string; contentMatches: boolean }>();
  const outOfBounds: number[] = [];

  for (let i = 0; i < chunk.oldAnchors.length; i++) {
    const anchor = chunk.oldAnchors[i];
    const lineIdx = anchor.line - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) {
      outOfBounds.push(anchor.line);
      continue;
    }

    const actualHash = computeLineHash(lines[lineIdx]);
    if (actualHash !== anchor.hash) {
      const contentMatches = normalizeForHash(lines[lineIdx], false) === normalizeForHash(chunk.oldLines[i], false);
      mismatchSet.set(anchor.line, { expected: anchor.hash, actual: actualHash, contentMatches });
    }
  }

  const firstLineNum = first.line;
  const contextStart = Math.max(0, firstLineNum - 5);
  const contextEnd = Math.min(lines.length, firstLineNum + 10);
  const sample: string[] = [];
  for (let i = contextStart; i < contextEnd; i++) {
    sample.push(`${i + 1}:${computeLineHash(lines[i])}|${lines[i]}`);
  }

  const expected: string[] = [];
  for (let i = 0; i < chunk.oldLines.length; i++) {
    const anchor = chunk.oldAnchors[i];
    expected.push(`${anchor.line}:${anchor.hash}|${chunk.oldLines[i]}`);
  }

  const messageLines: string[] = [];

  if (outOfBounds.length > 0) {
    messageLines.push(`LINE NUMBER ERROR: Line(s) ${outOfBounds.join(", ")} do not exist in ${pathText}.`);
    messageLines.push(`The file has ${lines.length} line(s). You MUST use line numbers within range 1-${lines.length}.`);
    messageLines.push("");
  }

  if (mismatchSet.size > 0) {
    const contentOnlyMismatches = [...mismatchSet.values()].filter(m => m.contentMatches);
    const hashMismatches = [...mismatchSet.values()].filter(m => !m.contentMatches);

    if (contentOnlyMismatches.length > 0) {
      messageLines.push(`MISMATCH: Formatting/whitespace changes detected.`);
    }

    if (hashMismatches.length > 0) {
      messageLines.push(`MISMATCH: ${hashMismatches.length} line(s) differ from expectation.`);
    }

    messageLines.push("CURRENT ANCHORS:");
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
      const hash = computeLineHash(content);
      const prefix = `${lineNum}:${hash}|${content}`;
      if (mismatchSet.has(lineNum)) {
        messageLines.push(`! ${prefix}`);
      } else {
        messageLines.push(`  ${prefix}`);
      }
    }
  }

  if (messageLines.length === 0) {
    messageLines.push(`ANCHOR ERROR: Failed to locate block at line ${firstLineNum} in ${pathText}.`);
    messageLines.push("Copy anchors from the CURRENT FILE STATE section above.");
  }

  const error = new Error(
    `PATCH FAILED: ${pathText}\n` + messageLines.join("\n")
  ) as AnchorError;
  error.expected = expected;
  error.actual = sample;
  error.suggest = mismatchSet.size > 0
    ? `Copy the [!!!] or [FMT] lines shown above - do not re-read the file.`
    : `Use anchors from the CURRENT FILE STATE section above.`;
  return error;
}

async function deriveUpdatedContentWithHealing(
  originalContent: string,
  filePath: string,
  chunks: EditFileChunk[],
  noops: ApplyNoop[],
): Promise<{ content: string; anchors: string[] }> {
  const originalLines = originalContent.split("\n");
  const replacements = computeReplacementsWithHealing(
    originalLines,
    filePath,
    chunks,
    noops,
    locate,
    findContext,
    contextError,
    mismatch,
    buildUniqueLineByHash,
  );
  const updatedLines = collapseEmpty(applyReplacements(originalLines, replacements));
  if (updatedLines[updatedLines.length - 1] !== "") updatedLines.push("");
  let content = updatedLines.join("\n");
  content = await formatContent(filePath, content);
  const formattedLines = content.split("\n");
  return { content, anchors: anchorLines(formattedLines) };
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

export async function applyHunks(cwd: string, hunks: Hunk[]): Promise<ApplySummary> {
  if (hunks.length === 0) {
    throw new Error("No files were modified. You MUST include at least one file section in the patch.");
  }
  const summary: ApplySummary = {
    created: [],
    edited: [],
    moved: [],
    deleted: [],
    failed: [],
    live: [],
    fileDiffs: [],
    noops: [],
  };

  const filePathsInPatch = new Set<string>();
  for (const hunk of hunks) {
    filePathsInPatch.add(hunk.filePath);
    if (hunk.type === "edit" && hunk.moveToPath) filePathsInPatch.add(hunk.moveToPath);
    if (hunk.type === "move" && hunk.moveToPath) filePathsInPatch.add(hunk.moveToPath);
  }

  for (const hunk of hunks) {
    try {
      if (hunk.type === "create") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        let exists = false;
        try {
          await fs.stat(target);
          exists = true;
        } catch {}
        if (exists) {
          throw new Error(
            `CONFLICT: File already exists: ${hunk.filePath}` +
              `\n` +
              `\nREQUIREMENT: You MUST NOT use Create File to overwrite existing files.` +
              `\n` +
              `\nACTION REQUIRED:` +
              `\n1. If you need to edit the file: Use Edit File instead` +
              `\n2. If you need full replacement: Use Delete File + Create File in ONE patch` +
              `\n   - Place Delete File before Create File` +
              `\n   - Both operations MUST be in the same apply_patch call`,
          );
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, hunk.contents, "utf-8");
        summary.created.push(hunk.filePath);
        summary.fileDiffs.push({ status: "C", path: hunk.filePath, diff: buildNumberedDiff("", hunk.contents) });
        upsertLive(summary, hunk.filePath, anchorsFromContent(hunk.contents));
        continue;
      }
      if (hunk.type === "delete") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        await fs.readFile(target, "utf-8");
        await fs.unlink(target);
        summary.deleted.push(hunk.filePath);
        summary.fileDiffs.push({ status: "D", path: hunk.filePath, diff: "" });
        continue;
      }
      if (hunk.type === "move") {
        const source = resolvePatchPath(cwd, hunk.filePath);
        const originalContent = await fs.readFile(source, "utf-8");
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        let destExists = false;
        try {
          await fs.stat(destination);
          destExists = true;
        } catch {}
        if (destExists) {
          throw new Error(
            `CONFLICT: Move destination already exists: ${hunk.moveToPath}` +
              `\n` +
              `\nACTION REQUIRED: Delete the destination file before moving, or use Edit File if you intend to merge.`,
          );
        }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, originalContent, "utf-8");
        try {
          await fs.unlink(source);
        } catch (error) {
          await fs.unlink(destination);
          throw error;
        }
        summary.moved.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "MV", path: hunk.moveToPath, moveFrom: hunk.filePath, diff: "" });
        upsertLive(summary, hunk.moveToPath, anchorsFromContent(originalContent));
        continue;
      }
      const source = resolvePatchPath(cwd, hunk.filePath);
      const originalContent = await fs.readFile(source, "utf-8");
      const next = await deriveUpdatedContentWithHealing(originalContent, source, hunk.chunks, summary.noops);
      const diff = buildNumberedDiff(originalContent, next.content);
      if (hunk.moveToPath) {
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        let destExists = false;
        try {
          await fs.stat(destination);
          destExists = true;
        } catch {}
        if (destExists) {
          throw new Error(
            `CONFLICT: Edit destination already exists: ${hunk.moveToPath}` +
              `\n` +
              `\nACTION REQUIRED: Delete the destination file before moving/editing, or edit the existing file directly.`,
          );
        }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, next.content, "utf-8");
        try {
          await fs.unlink(source);
        } catch (error) {
          await fs.unlink(destination);
          throw error;
        }
        summary.edited.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "E", path: hunk.moveToPath, moveFrom: hunk.filePath, diff });
        upsertLive(summary, hunk.moveToPath, next.anchors);
        continue;
      }
      await fs.writeFile(source, next.content, "utf-8");
      summary.edited.push(hunk.filePath);
      summary.fileDiffs.push({ status: "E", path: hunk.filePath, diff });
      upsertLive(summary, hunk.filePath, next.anchors);
    } catch (error) {
      const typed = error as AnchorError;
      const message = error instanceof Error ? error.message : String(error);
      const failure = { path: hunk.filePath, error: message } as {
        path: string;
        error: string;
        expected?: string[];
        actual?: string[];
        suggest?: string;
      };
      if (typed.expected && typed.expected.length > 0) failure.expected = typed.expected;
      if (typed.actual && typed.actual.length > 0) failure.actual = typed.actual;
      if (typed.suggest) failure.suggest = typed.suggest;
      summary.failed.push(failure);
    }
  }

  const failedPaths = new Set(summary.failed.map((f) => f.path));
  if (failedPaths.size > 0) {
    for (const filePath of filePathsInPatch) {
      const isLive = summary.live.some((l) => l.path === filePath);
      if (!isLive) {
        try {
          const absolutePath = resolvePatchPath(cwd, filePath);
          const content = await fs.readFile(absolutePath, "utf-8");
          upsertLive(summary, filePath, anchorsFromContent(content));
        } catch {}
      }
    }
  }

  return summary;
}
