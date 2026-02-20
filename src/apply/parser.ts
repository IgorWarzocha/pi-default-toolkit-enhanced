import {
  BEGIN_PATCH_MARKER,
  END_PATCH_MARKER,
  END_PATCH_MARKER_LOOSE,
  CREATE_FILE_MARKER,
  DELETE_FILE_MARKER,
  EDIT_FILE_MARKER,
  MOVE_TO_MARKER,
  EOF_MARKER,
  MOVE_FILE_MARKER,
  CHANGE_CONTEXT_MARKER,
  EMPTY_CHANGE_CONTEXT_MARKER,
} from "./constants.js";
import { ensureRelativePatchPath } from "./path-utils.js";
import { InvalidPatchError, InvalidHunkError, type Hunk, type EditFileChunk } from "./types.js";

function sanitizeAddedLine(line: string): string {
  let next = line;
  while (/^\d+\|/.test(next)) {
    next = next.replace(/^\d+\|/, "");
  }
  return next;
}

function parseAnchoredBody(body: string, lineNumber: number): { line: string; lineNumber: number } {
  const match = body.trimStart().match(/^(\d+)\|(.*)$/);
  if (!match) {
    if (body.length === 0) {
      throw new InvalidHunkError("Context/removal lines MUST NOT be empty.", lineNumber);
    }
    return { line: body, lineNumber: 0 };
  }
  const rawLine = Number.parseInt(match[1], 10);
  if (!Number.isFinite(rawLine) || rawLine < 1) {
    throw new InvalidHunkError(
      `INVALID LINE NUMBER: '${match[1]}'` +
        `\nLine numbers MUST be positive integers starting from 1.`,
      lineNumber,
    );
  }
  return { line: match[2], lineNumber: rawLine };
}

function normalizePatchText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "    ").trim();
}

function stripHeredoc(input: string): string {
  const heredocMatch = input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
  return heredocMatch ? heredocMatch[2] : input;
}

function assertNoAbsolutePaths(hunks: Hunk[]): void {
  for (const hunk of hunks) {
    ensureRelativePatchPath(hunk.filePath);
    if (hunk.type === "edit" && hunk.moveToPath) {
      ensureRelativePatchPath(hunk.moveToPath);
    }
    if (hunk.type === "move") {
      ensureRelativePatchPath(hunk.moveToPath);
    }
  }
}

export function parsePatch(patchText: string): Hunk[] {
  const cleaned = stripHeredoc(normalizePatchText(patchText));
  const lines = cleaned.split("\n");

  checkPatchBoundaries(lines);

  const hunks: Hunk[] = [];
  const lastIndex = Math.max(1, lines.length - 1);
  let remaining = lines.slice(1, lastIndex);
  let lineNumber = 2;

  try {
    while (remaining.length > 0) {
      if (remaining[0].trim().length === 0) {
        lineNumber += 1;
        remaining = remaining.slice(1);
        continue;
      }
      const { hunk, consumedLines } = parseOneHunk(remaining, lineNumber);
      hunks.push(hunk);
      remaining = remaining.slice(consumedLines);
      lineNumber += consumedLines;
    }
  } catch (e) {
    if (hunks.length > 0 && e instanceof Error) {
      const parsed = hunks.map((h) => h.filePath).join(", ");
      e.message = `${e.message}\n\nContext: parsed ${hunks.length} hunk(s) before failure: [${parsed}]. ${remaining.length} lines remain unparsed.`;
    }
    throw e;
  }

  assertNoAbsolutePaths(hunks);
  return hunks;
}

function checkPatchBoundaries(lines: string[]): void {
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    throw new InvalidPatchError(
      "Patch is empty. You MUST provide content between the Begin Patch and End Patch markers.",
    );
  }

  const firstLine = (lines[0] ?? "").trim();
  const lastIndex = lines.length - 1;
  const lastLine = (lines[lastIndex] ?? "").trim();
  const plusEndMarker = /^\+\*{2,3}\s*end\s*patch\s*$/i;

  if (plusEndMarker.test(lastLine)) {
    lines[lastIndex] = END_PATCH_MARKER;
  }

  const normalizedLastLine = (lines[lastIndex] ?? "").trim();

  if (firstLine !== BEGIN_PATCH_MARKER) {
    throw new InvalidPatchError(
      `First line MUST be '${BEGIN_PATCH_MARKER}'. Got: '${firstLine.slice(0, 80)}'.` +
        `\nYou MUST start patchText with exactly: ${BEGIN_PATCH_MARKER}`,
    );
  }

  if (normalizedLastLine === END_PATCH_MARKER || END_PATCH_MARKER_LOOSE.test(normalizedLastLine)) {
    lines[lastIndex] = END_PATCH_MARKER;
    return;
  }

  const prefixedEndMarkerIndex = lines.findIndex((line) => plusEndMarker.test(line.trim()));
  if (prefixedEndMarkerIndex !== -1) {
    throw new InvalidPatchError(
      `Found a prefixed end marker ('+*** End Patch') at line ${prefixedEndMarkerIndex + 1}.` +
        `\nYou MUST NOT prefix patch envelope markers with '+'.` +
        `\nYou MUST place exactly '${END_PATCH_MARKER}' as the final non-empty line.`,
    );
  }

  const totalLines = lines.length;
  const lastFewLines = lines.slice(Math.max(0, totalLines - 4));
  const looksLikeContent = lastFewLines.some(
    (l) => l.startsWith("+") || l.startsWith("-") || l.startsWith(" "),
  );

  if (looksLikeContent) {
    throw new InvalidPatchError(
      `Patch appears truncated — end marker missing (${totalLines} lines received, last: '${normalizedLastLine.slice(0, 60)}').` +
        `\nYou MUST split large patches — one file per call, max ~800 added lines.` +
        `\nYou MUST ensure patchText ends with exactly: ${END_PATCH_MARKER}`,
    );
  }

  throw new InvalidPatchError(
    `Last line MUST be '${END_PATCH_MARKER}'. Got: '${normalizedLastLine.slice(0, 80)}'.` +
      `\nYou MUST end patchText with exactly: ${END_PATCH_MARKER}` +
      `\nYou MUST NOT add trailing blank lines or comments after the end marker.`,
  );
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: Hunk; consumedLines: number } {
  const firstLine = lines[0]?.trim() ?? "";
  if (firstLine.startsWith(CREATE_FILE_MARKER)) {
    const filePath = firstLine.slice(CREATE_FILE_MARKER.length);
    let contents = "";
    let consumedLines = 1;

    for (const addLine of lines.slice(1)) {
      if (addLine.startsWith("+")) {
        contents += `${sanitizeAddedLine(addLine.slice(1))}\n`;
        consumedLines += 1;
        continue;
      }
      if (addLine.startsWith("***")) break;
      if (addLine.startsWith("@@ ") || addLine === "@@") break;
      contents += `${addLine}\n`;
      consumedLines += 1;
    }

    if (consumedLines === 1) {
      throw new InvalidHunkError(
        `Create file hunk for '${filePath}' has no content lines.` +
          `\nYou MAY use '+' prefix on each line or provide raw content.`,
        lineNumber,
      );
    }

    return { hunk: { type: "create", filePath, contents }, consumedLines };
  }

  if (firstLine.startsWith(DELETE_FILE_MARKER)) {
    const filePath = firstLine.slice(DELETE_FILE_MARKER.length);
    return { hunk: { type: "delete", filePath }, consumedLines: 1 };
  }
  if (firstLine.startsWith(MOVE_FILE_MARKER)) {
    const filePath = firstLine.slice(MOVE_FILE_MARKER.length);
    const toLine = lines[1];
    if (!toLine?.trim().startsWith(MOVE_TO_MARKER)) {
      throw new InvalidHunkError(
        `Move file for '${filePath}' MUST be followed by '${MOVE_TO_MARKER}<new-path>'.`,
        lineNumber,
      );
    }
    const moveToPath = toLine.trim().slice(MOVE_TO_MARKER.length);
    return { hunk: { type: "move", filePath, moveToPath }, consumedLines: 2 };
  }

  if (firstLine.startsWith(EDIT_FILE_MARKER)) {
    const filePath = firstLine.slice(EDIT_FILE_MARKER.length);
    let consumedLines = 1;
    let remaining = lines.slice(1);

    let moveToPath: string | undefined;
    const moveLine = remaining[0];
    if (moveLine?.startsWith(MOVE_TO_MARKER)) {
      moveToPath = moveLine.slice(MOVE_TO_MARKER.length);
      consumedLines += 1;
      remaining = remaining.slice(1);
    }

    const chunks: EditFileChunk[] = [];
    while (remaining.length > 0) {
      if (remaining[0].trim().length === 0) {
        consumedLines += 1;
        remaining = remaining.slice(1);
        continue;
      }
      if (remaining[0].startsWith("***")) break;
      const { chunk, consumedLines: consumedByChunk } = parseEditFileChunk(
        remaining,
        lineNumber + consumedLines,
      );
      chunks.push(chunk);
      consumedLines += consumedByChunk;
      remaining = remaining.slice(consumedByChunk);
    }
    if (chunks.length === 0) {
      throw new InvalidHunkError(
        `Edit file hunk for '${filePath}' has no chunks.` +
         `\nYou MUST provide ' ', '+', or '-' prefixed lines.`,
        lineNumber,
      );
    }

    return { hunk: { type: "edit", filePath, moveToPath, chunks }, consumedLines };
  }
  throw new InvalidHunkError(
    `'${firstLine.slice(0, 100)}' is not a valid hunk header.` +
      `\nYou MUST use one of: '${CREATE_FILE_MARKER}<path>', '${DELETE_FILE_MARKER}<path>', '${EDIT_FILE_MARKER}<path>', '${MOVE_FILE_MARKER}<path>'.` +
      `\nYou MUST NOT place content lines outside of a file section.`,
    lineNumber,
  );
}

function parseEditFileChunk(
  lines: string[],
  lineNumber: number,
): { chunk: EditFileChunk; consumedLines: number } {
  if (lines.length === 0) {
    throw new InvalidHunkError(
 "Edit hunk has no lines. Provide ' ', '+', or '-' prefixed lines.",
      lineNumber,
    );
  }

  let changeContext: string | undefined;
  let startIndex: number;
  let oldStart = 0;

  if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) {
    startIndex = 1;
  } else if (lines[0].startsWith(CHANGE_CONTEXT_MARKER)) {
    const raw = lines[0];
    const git = raw.match(/^@@\s*-(\d+)(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@\s*(.*)$/);
    if (git) {
      oldStart = Number.parseInt(git[1], 10);
      changeContext = git[2];
    } else {
      changeContext = raw.slice(CHANGE_CONTEXT_MARKER.length);
    }
    startIndex = 1;
  } else {
    startIndex = 0;
  }

  if (startIndex >= lines.length) {
    throw new InvalidHunkError(
       "Edit hunk has @@ marker but no content lines. You MUST provide ' ', '+', or '-' prefixed lines.",
      lineNumber + 1,
    );
  }
  const chunk: EditFileChunk = {
    changeContext,
    oldLines: [],
    oldAnchors: [],
    newLines: [],
    isEndOfFile: false,
  };
  let parsedBodyLines = 0;
  for (const line of lines.slice(startIndex)) {
    if (line === EOF_MARKER) {
      if (parsedBodyLines === 0) {
        throw new InvalidHunkError(
          "Edit hunk has EOF marker but no content before it. You MUST provide content lines before the EOF marker.",
          lineNumber + 1,
        );
      }
      chunk.isEndOfFile = true;
      parsedBodyLines += 1;
      break;
    }

    if (line.startsWith("*** ")) {
      break;
    }

    if (line === EMPTY_CHANGE_CONTEXT_MARKER || line.startsWith(CHANGE_CONTEXT_MARKER)) {
      if (parsedBodyLines > 0) break;
    }

    if (line.length === 0) {
      if (chunk.oldLines.length > 0 || chunk.newLines.length > 0) {
        const nextLine = lines[startIndex + parsedBodyLines + 1];
        if (nextLine && nextLine.length > 0 && !nextLine.startsWith("*** ")) {
          chunk.newLines.push("");
          parsedBodyLines += 1;
          continue;
        }
      }
      break;
    }

    const prefix = line[0];
    if (prefix === " ") {
      const anchored = parseAnchoredBody(line.slice(1), lineNumber + startIndex + parsedBodyLines + 1);
      chunk.oldLines.push(anchored.line);
      chunk.oldAnchors.push({ line: anchored.lineNumber });
      chunk.newLines.push(anchored.line);
      parsedBodyLines += 1;
      continue;
    }
    if (prefix === "+") {
      chunk.newLines.push(sanitizeAddedLine(line.slice(1)));
      parsedBodyLines += 1;
      continue;
    }
    if (prefix === "-") {
      const anchored = parseAnchoredBody(line.slice(1), lineNumber + startIndex + parsedBodyLines + 1);
      chunk.oldLines.push(anchored.line);
      chunk.oldAnchors.push({ line: anchored.lineNumber });
      parsedBodyLines += 1;
      continue;
    }

    if (chunk.oldLines.length === 0 && !chunk.changeContext) {
      throw new InvalidHunkError(
        `Unexpected unprefixed line in edit hunk: '${line.slice(0, 80)}'.` +
          `\nUnprefixed additions are allowed only after at least one context/removal line or @@ context.` +
          `\nYou SHOULD use '+' for additions when no context/removal lines are provided.`,
        lineNumber + startIndex + parsedBodyLines + 1,
      );
    }
    chunk.newLines.push(line);
    parsedBodyLines += 1;
    continue;
  }
  if (oldStart > 0) {
    for (let index = 0; index < chunk.oldAnchors.length; index += 1) {
      if (chunk.oldAnchors[index].line > 0) continue;
      chunk.oldAnchors[index].line = oldStart + index;
    }
  }

  return { chunk, consumedLines: parsedBodyLines + startIndex };
}
