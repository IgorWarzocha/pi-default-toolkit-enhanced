import {
  BEGIN_PATCH_MARKER,
  END_PATCH_MARKER,
  END_PATCH_MARKER_LOOSE,
  EOF_MARKER,
  EMPTY_CHANGE_CONTEXT_MARKER,
} from "./constants.js";
import { ensureRelativePatchPath } from "./path-utils.js";
import { InvalidPatchError, InvalidHunkError, type Hunk, type EditFileChunk } from "./types.js";

function sanitizeAddedLine(line: string): string {
  return line;
}

function parseAnchoredBody(body: string): { line: string; lineNumber: number } {
  const match = body.match(/^\s*(\d+)\s*[:|]\s?(.*)$/);
  if (!match) return { line: body, lineNumber: 0 };
  const lineNumber = Number.parseInt(match[1], 10);
  const line = match[2] ?? "";
  return { line, lineNumber: Number.isFinite(lineNumber) ? lineNumber : 0 };
}

function normalizePatchText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
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

function isBeginPatch(line: string): boolean {
  return /^(?:\*{3}|#{3})\s*Begin Patch(?:\s*(?:\*{3}|#{3}))?\s*$/i.test(line.trim());
}

function isEndPatch(line: string): boolean {
  return /^(?:\*{3}|#{3})\s*End Patch(?:\s*(?:\*{3}|#{3}))?\s*$/i.test(line.trim());
}

function parseHeader(line: string): { kind: "create" | "edit" | "delete" | "move"; path: string } | undefined {
  const match = line.trim().match(/^(?:(?:\*{3}|#{3})\s*)?(Create File|Create|Edit File|Edit|Delete File|Delete|Move File|Move)\s*:\s*(.+)$/i);
  if (!match) return undefined;
  const token = match[1].toLowerCase();
  const path = match[2].replace(/\s*(?:\*{3}|#{3})\s*$/, "").trim();
  if (path.length === 0) return undefined;
  if (token === "create file" || token === "create") return { kind: "create", path };
  if (token === "edit file" || token === "edit") return { kind: "edit", path };
  if (token === "delete file" || token === "delete") return { kind: "delete", path };
  return { kind: "move", path };
}

function parseInlineMove(path: string): { from: string; to: string } | undefined {
  const match = path.match(/^(.*?)\s*->\s*(.*?)$/);
  if (!match) return undefined;
  const from = (match[1] ?? "").trim();
  const to = (match[2] ?? "").trim();
  if (from.length === 0 || to.length === 0) return undefined;
  return { from, to };
}

function parseMoveTo(line: string): string | undefined {
  const match = line.trim().match(/^(?:(?:\*{3}|#{3})\s*)?Move to\s*:\s*(.+)$/i);
  if (!match) return undefined;
  const path = match[1].replace(/\s*(?:\*{3}|#{3})\s*$/, "").trim();
  if (path.length === 0) return undefined;
  return path;
}

type HunkHeaderSpec = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  context: string;
};

function parseHunkHeaderSpec(line: string): HunkHeaderSpec | undefined {
  const raw = line.trim();
  const full = raw.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@\s*(.*)$/);
  if (!full) return undefined;
  const oldStart = Number.parseInt(full[1], 10);
  const oldCount = full[2] ? Number.parseInt(full[2], 10) : 1;
  const newStart = Number.parseInt(full[3], 10);
  const newCount = full[4] ? Number.parseInt(full[4], 10) : 1;
  const context = full[5] ?? "";
  return { oldStart, oldCount, newStart, newCount, context };
}

function isChangeContext(line: string): boolean {
  return line.trim().startsWith("@@");
}

function isSectionBoundary(line: string): boolean {
  if (isChangeContext(line)) return true;
  if (isEndPatch(line)) return true;
  if (parseHeader(line) !== undefined) return true;
  return false;
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

  if (!isBeginPatch(firstLine)) {
    throw new InvalidPatchError(
      `First line MUST be a Begin Patch marker. Got: '${firstLine.slice(0, 80)}'.` +
        `\nYou MUST start patchText with exactly: *** Begin Patch`,
    );
  }

  lines[0] = BEGIN_PATCH_MARKER;

  if (isEndPatch(normalizedLastLine) || END_PATCH_MARKER_LOOSE.test(normalizedLastLine)) {
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
    `Last line MUST be an End Patch marker. Got: '${normalizedLastLine.slice(0, 80)}'.` +
      `\nYou MUST end patchText with exactly: *** End Patch` +
      `\nYou MUST NOT add trailing blank lines or comments after the end marker.`,
  );
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: Hunk; consumedLines: number } {
  const firstLine = lines[0]?.trim() ?? "";
  const header = parseHeader(firstLine);
  if (!header && (/^(?:\*{3}|#{3})/.test(firstLine) || /^[A-Za-z]+\s*:/.test(firstLine))) {
    throw new InvalidHunkError(
      `Invalid file section header at line ${lineNumber}: '${firstLine.slice(0, 100)}'.`,
      lineNumber,
      ["*** Create File: <path>", "*** Edit File: <path>", "*** Delete File: <path>", "*** Move File: <path>"],
      [firstLine],
    );
  }
  if (header && header.kind === "create") {
    const filePath = header.path;
    let contents = "";
    let consumedLines = 1;

    for (const addLine of lines.slice(1)) {
      if (addLine.startsWith("+")) {
        contents += `${sanitizeAddedLine(addLine.slice(1))}\n`;
        consumedLines += 1;
        continue;
      }
      if (addLine.trim().startsWith("@@")) {
        consumedLines += 1;
        continue;
      }
      if (isSectionBoundary(addLine)) break;
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

  if (header && header.kind === "delete") {
    const filePath = header.path;
    let consumedLines = 1;
    for (const next of lines.slice(1)) {
      if (isSectionBoundary(next)) break;
      consumedLines += 1;
    }
    return { hunk: { type: "delete", filePath }, consumedLines };
  }
  if (header && header.kind === "move") {
    const inline = parseInlineMove(header.path);
    if (inline) {
      return { hunk: { type: "move", filePath: inline.from, moveToPath: inline.to }, consumedLines: 1 };
    }
    const filePath = header.path;
    const toLine = lines[1];
    const moveToPath = toLine ? parseMoveTo(toLine) : undefined;
    if (!moveToPath) {
      throw new InvalidHunkError(
        `Move file for '${filePath}' MUST be followed by a Move to marker.`,
        lineNumber,
      );
    }
    return { hunk: { type: "move", filePath, moveToPath }, consumedLines: 2 };
  }

  if (header && header.kind === "edit") {
    const inline = parseInlineMove(header.path);
    const filePath = inline ? inline.from : header.path;
    let consumedLines = 1;
    let remaining = lines.slice(1);

    let moveToPath: string | undefined = inline ? inline.to : undefined;
    const moveLine = remaining[0];
    const parsedMoveTo = moveLine ? parseMoveTo(moveLine) : undefined;
    if (parsedMoveTo) {
      moveToPath = parsedMoveTo;
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
      if (parseHeader(remaining[0]) !== undefined || isEndPatch(remaining[0])) break;
      const { chunk, consumedLines: consumedByChunk } = parseEditFileChunk(
        remaining,
        lineNumber + consumedLines,
      );
      if (consumedByChunk <= 0) {
        throw new InvalidHunkError(
          `Edit file hunk for '${filePath}' is malformed near '${(remaining[0] ?? "").slice(0, 80)}'.` +
            `\nYou MUST provide @@ context lines and body lines prefixed with ' ', '+', or '-'.`,
          lineNumber + consumedLines,
        );
      }
      if (chunk.oldLines.length === 0 && chunk.newLines.length === 0) {
        consumedLines += consumedByChunk;
        remaining = remaining.slice(consumedByChunk);
        continue;
      }
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
      `\nYou MUST use one of: '*** Create File: <path>', '*** Delete File: <path>', '*** Edit File: <path>', '*** Move File: <path>'.` +
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
  let headerSpec: HunkHeaderSpec | undefined;

  const first = lines[0]?.trim() ?? "";

  if (first === EMPTY_CHANGE_CONTEXT_MARKER) {
    changeContext = "";
    startIndex = 1;
  } else if (isChangeContext(first)) {
    const raw = first;
    headerSpec = parseHunkHeaderSpec(raw);
    if (headerSpec) {
      oldStart = headerSpec.oldStart;
      changeContext = headerSpec.context;
      startIndex = 1;
    } else {
      const gitOldOnly = raw.match(/^@@\s*-(\d+)(?:,\d+)?\s*@@\s*(.*)$/);
      if (gitOldOnly) {
        oldStart = Number.parseInt(gitOldOnly[1], 10);
        changeContext = gitOldOnly[2];
        startIndex = 1;
      } else {
        const malformed = raw.match(/^@@\s*-[^@]*$/);
        if (malformed) {
          throw new InvalidHunkError(
            `Malformed hunk header at line ${lineNumber}: '${raw.slice(0, 100)}'.`,
            lineNumber,
            ["@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ <context>"],
            [raw],
          );
        }
        changeContext = raw.replace(/^@@\s?/, "");
        startIndex = 1;
      }
    }
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

    if (isSectionBoundary(line)) {
      break;
    }

    if (line.trim() === EMPTY_CHANGE_CONTEXT_MARKER || isChangeContext(line)) {
      if (parsedBodyLines > 0) break;
    }

    if (line.length === 0) {
      if (chunk.oldLines.length > 0 || chunk.newLines.length > 0) {
        const nextLine = lines[startIndex + parsedBodyLines + 1];
        if (nextLine && nextLine.length > 0 && !isSectionBoundary(nextLine)) {
          chunk.newLines.push("");
          parsedBodyLines += 1;
          continue;
        }
      }
      break;
    }

    const prefix = line[0];
    if (prefix === " ") {
      const anchored = parseAnchoredBody(line.slice(1));
      chunk.oldLines.push(anchored.line);
      chunk.oldAnchors.push({ line: anchored.lineNumber, offset: lineNumber + startIndex + parsedBodyLines });
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
      const anchored = parseAnchoredBody(line.slice(1));
      chunk.oldLines.push(anchored.line);
      chunk.oldAnchors.push({ line: anchored.lineNumber, offset: lineNumber + startIndex + parsedBodyLines });
      parsedBodyLines += 1;
      continue;
    }

    if (chunk.oldLines.length === 0 && chunk.changeContext !== undefined) {
      chunk.newLines.push(line);
      parsedBodyLines += 1;
      continue;
    }

    if (chunk.oldLines.length === 0 && !chunk.changeContext) {
      throw new InvalidHunkError(
        `INVALID HUNK LINE: '${line.slice(0, 80)}'.` +
          `\nYou MUST prefix each edit line with exactly one of: ' ' (context), '-' (removal), '+' (addition).` +
          `\nYou MUST prefix this line with ' ' if it is context, or '+' if it is an addition.`,
        lineNumber + startIndex + parsedBodyLines + 1,
      );
    }

    chunk.oldLines.push(line);
    chunk.oldAnchors.push({ line: 0, offset: lineNumber + startIndex + parsedBodyLines });
    chunk.newLines.push(line);
    parsedBodyLines += 1;
    continue;
  }
  if (oldStart > 0) {
    for (let index = 0; index < chunk.oldAnchors.length; index += 1) {
      if (chunk.oldAnchors[index].line > 0) continue;
      chunk.oldAnchors[index].line = oldStart + index;
    }
    if (chunk.oldAnchors.length === 0) {
      chunk.oldAnchors.push({ line: oldStart, offset: lineNumber + startIndex });
    }
  }

  if (headerSpec) {
    const oldCountActual = chunk.oldLines.length;
    const newCountActual = chunk.newLines.length;
    if (headerSpec.oldCount !== oldCountActual || headerSpec.newCount !== newCountActual) {
      throw new InvalidHunkError(
        `Hunk header counts are invalid at line ${lineNumber}. Expected -${headerSpec.oldCount} +${headerSpec.newCount} but parsed -${oldCountActual} +${newCountActual}.`,
        lineNumber,
        [`-${headerSpec.oldCount}`, `+${headerSpec.newCount}`],
        [`-${oldCountActual}`, `+${newCountActual}`],
      );
    }
  }

  if (chunk.oldLines.length === 0 && chunk.changeContext === undefined && chunk.newLines.length > 0) {
    throw new InvalidHunkError(
      "Insertion-only hunks MUST provide @@ context for deterministic placement.",
      lineNumber + startIndex,
    );
  }

  return { chunk, consumedLines: parsedBodyLines + startIndex };
}
