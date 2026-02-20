import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
import { computeLineHash } from "../shared/hash.js";
import type { HashFileInput, ReadHashDetail } from "./types.js";

const IMAGE_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
];

function detectImage(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) {
      if (sig.mime === "image/webp" && (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50)) continue;
      return sig.mime;
    }
  }
  return null;
}

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;
const MAX_MATCHES = 1000;

function prefixLine(lineNo: number, content: string): string {
  return `${lineNo}:${computeLineHash(content)}|${content}`;
}

function createMatcher(file: HashFileInput): (line: string) => boolean {
  const search = file.search;
  if (!search) throw new Error("Search query is required.");
  const sensitive = file.caseSensitive === true;
  if (file.regex) {
    const re = new RegExp(search, sensitive ? "" : "i");
    return (l: string) => re.test(l);
  }
  const needle = sensitive ? search : search.toLowerCase();
  return (l: string) => (sensitive ? l : l.toLowerCase()).includes(needle);
}

function searchFile(lines: string[], file: HashFileInput): { output: string[]; matches: number } {
  const matcher = createMatcher(file);
  const cap = Math.min(Math.max(1, file.maxMatches ?? 200), MAX_MATCHES);
  const before = Math.max(0, file.contextBefore ?? 0);
  const after = Math.max(0, file.contextAfter ?? 0);

  const matchIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (matcher(lines[i])) {
      matchIndices.push(i);
      if (matchIndices.length >= cap) break;
    }
  }

  const include = new Set<number>();
  for (const idx of matchIndices) {
    for (let i = Math.max(0, idx - before); i <= Math.min(lines.length - 1, idx + after); i++) {
      include.add(i);
    }
  }

  const sorted = Array.from(include).sort((a, b) => a - b);
  const output: string[] = [];
  output.push(`Search: '${file.search}' | Matches: ${matchIndices.length}`);

  if (sorted.length === 0) return { output, matches: 0 };

  let prev = -2;
  for (const idx of sorted) {
    if (prev !== -2 && idx > prev + 1) output.push("...");
    output.push(prefixLine(idx + 1, lines[idx]));
    prev = idx;
  }

  return { output, matches: matchIndices.length };
}

function readRange(lines: string[], file: HashFileInput): { output: string[]; truncated: boolean } {
  const start = Math.max(0, (file.offset ?? 1) - 1);
  const total = lines.length;

  if (start >= total) throw new Error(`Offset ${file.offset} is beyond end of file (${total} lines)`);

  const end = file.limit ? Math.min(total, start + file.limit) : total;
  const output: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (let i = start; i < end; i++) {
    const line = prefixLine(i + 1, lines[i]);
    if (output.length >= MAX_LINES || bytes + line.length > MAX_BYTES) {
      truncated = true;
      const nextOffset = i + 1;
      output.push(`\n[Showing lines ${start + 1}-${i} of ${total}. Use offset=${nextOffset} to continue.]`);
      break;
    }
    output.push(line);
    bytes += line.length + 1;
  }

  if (!truncated && file.limit && start + file.limit < total) {
    const remaining = total - (start + file.limit);
    output.push(`\n[${remaining} more lines. Use offset=${end + 1} to continue.]`);
  }

  return { output, truncated };
}

export async function executeReadHash(cwd: string, files: HashFileInput[]) {
  const content: (TextContent | ImageContent)[] = [];
  const details: ReadHashDetail[] = [];

  for (const file of files) {
    try {
      const abs = path.resolve(cwd, file.path.replace(/^@/, "").trim());
      await access(abs, constants.R_OK);
      const buffer = await readFile(abs);
      const mime = detectImage(buffer);

      if (files.length > 1) content.push({ type: "text", text: `--- ${file.path} ---` });

      if (mime) {
        if (file.search) throw new Error("Search is not supported for image files.");
        content.push({ type: "text", text: `Read image file [${mime}]` });
        content.push({ type: "image", data: buffer.toString("base64"), mimeType: mime });
        details.push({ path: file.path });
      } else if (file.search) {
        const lines = buffer.toString("utf-8").split("\n");
        const result = searchFile(lines, file);
        content.push({ type: "text", text: result.output.join("\n") });
        details.push({ path: file.path, search: file.search, regex: file.regex, matches: result.matches });
      } else {
        const lines = buffer.toString("utf-8").split("\n");
        const result = readRange(lines, file);
        content.push({ type: "text", text: result.output.join("\n") });
        details.push({ path: file.path, offset: file.offset, limit: file.limit, truncated: result.truncated });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      content.push({ type: "text", text: `--- ${file.path} ---\nERROR: ${msg}` });
      details.push({ path: file.path, error: msg });
    }
  }

  return { content, details: { files: details } };
}
