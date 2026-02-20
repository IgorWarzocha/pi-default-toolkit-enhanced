import * as fs from "node:fs/promises";
import { resolvePatchPath } from "./path-utils.js";
import { computeLineHash } from "../shared/hash.js";
import { normalizeForHash } from "../shared/normalize.js";
import { InvalidHunkError } from "./types.js";

function extractInvalidLine(message: string): string | undefined {
  const match = message.match(/Anchored line is invalid: '([^']*)'/);
  if (!match) return undefined;
  return match[1];
}

function extractUpdatePath(lines: string[], lineNumber: number): string | undefined {
  let index = Math.min(lines.length - 1, Math.max(0, lineNumber - 1));
  while (index >= 0) {
    const line = lines[index].trim();
    if (line.startsWith("*** Edit File: ")) return line.slice("*** Edit File: ".length);
    index -= 1;
  }
  return undefined;
}

function anchoredWindow(lines: string[], center: number): string[] {
  const start = Math.max(0, center - 4);
  const stop = Math.min(lines.length, center + 9);
  const out: string[] = [];
  let index = start;
  while (index < stop) {
    out.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  return out;
}

function findLine(lines: string[], target: string): number {
  let index = 0;
  const normalized = normalizeForHash(target, false);
  while (index < lines.length) {
    if (normalizeForHash(lines[index], false) === normalized) return index;
    index += 1;
  }
  return -1;
}

export async function enrichParseError(cwd: string, patchText: string, error: unknown): Promise<string> {
  if (!(error instanceof InvalidHunkError)) return error instanceof Error ? error.message : String(error);
  const invalid = extractInvalidLine(error.message);
  if (!invalid) return error.message;
  const patchLines = patchText.replace(/\r\n/g, "\n").split("\n");
  const filePath = extractUpdatePath(patchLines, error.lineNumber);
  if (!filePath) return error.message;
  const source = resolvePatchPath(cwd, filePath);
  let content = "";
  try {
    content = await fs.readFile(source, "utf-8");
  } catch {
    return `${error.message}\n\nAuto context unavailable: failed to read '${filePath}'.`;
  }
  const fileLines = content.split("\n");
  const center = findLine(fileLines, invalid);
  const sample = center >= 0 ? anchoredWindow(fileLines, center) : anchoredWindow(fileLines, 0);
  const hint = center >= 0
    ? `Use the anchored line for '${invalid}' from '${filePath}' in a ' ' or '-' line.`
    : `The invalid line text was not found exactly in '${filePath}'. Run read for a precise anchor near the target edit.`;
  const details = [
    error.message,
    ``,
    `Auto context from ${filePath}:`,
    ...sample.map((line) => `  ${line}`),
    `Hint: ${hint}`,
  ];
  return details.join("\n");
}
