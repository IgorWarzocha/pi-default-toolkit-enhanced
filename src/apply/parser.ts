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
  while (/^\d+:[0-9a-f]{2}\|/.test(next)) {
    next = next.replace(/^\d+:[0-9a-f]{2}\|/, "");
  }
  return next;
}

function parseAnchoredBody(body: string, lineNumber: number): { line: string; lineNumber: number; hash: string } {
  const trimmed = body.trimStart();
  const match = trimmed.match(/^(\d+):([0-9a-f]{2})\|(.*)$/);
  if (!match) {
    throw new InvalidHunkError(
      `INVALID ANCHOR FORMAT: '${body.slice(0, 120)}'` +
        `\n` +
        `\nREQUIREMENT: Context (' ') and removal ('-') lines MUST include LINE:HASH| prefix.` +
        `\nCORRECT FORMAT: '42:ab|content' where 42 is the line number and ab is the hash.` +
        `\n` +
        `\nACTION REQUIRED:` +
        `\n1. Copy anchored lines EXACTLY from the error context above` +
        `\n2. Use those anchors in your context (' ') and removal ('-') lines` +
        `\n` +
        `\nNOTE: If you intend to replace most of the file, you SHOULD use Delete File + Create File.`,
      lineNumber,
    );
  }
  const rawLine = Number.parseInt(match[1], 10);
  if (!Number.isFinite(rawLine) || rawLine < 1) {
    throw new InvalidHunkError(
      `INVALID LINE NUMBER: '${match[1]}'` +
        `\nLine numbers MUST be positive integers starting from 1.` +
        `\nYou MUST use the exact line numbers from the read tool output.`,
      lineNumber,
    );
  }
  return { line: match[3], lineNumber: rawLine, hash: match[2] };
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

  if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) {
    startIndex = 1;
  } else if (lines[0].startsWith(CHANGE_CONTEXT_MARKER)) {
    changeContext = lines[0].slice(CHANGE_CONTEXT_MARKER.length);
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

    if (line.length === 0) {
      if (chunk.oldLines.length > 0 || chunk.newLines.length > 0) {
        const nextLine = lines[startIndex + parsedBodyLines + 1];
        if (nextLine && nextLine.length > 0) {
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
      chunk.oldAnchors.push({ line: anchored.lineNumber, hash: anchored.hash });
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
      chunk.oldAnchors.push({ line: anchored.lineNumber, hash: anchored.hash });
      parsedBodyLines += 1;
      continue;
    }

    if (parsedBodyLines === 0) {
      throw new InvalidHunkError(
        `Unexpected line in edit hunk: '${line.slice(0, 80)}'.` +
          `\nEvery line MUST start with ' ' (context), '+' (add), or '-' (remove). You MUST NOT have unprefixed lines.`,
        lineNumber + 1,
      );
    }
    break;
  }
  return { chunk, consumedLines: parsedBodyLines + startIndex };
}
