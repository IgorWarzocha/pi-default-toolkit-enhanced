import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
import type { ReadFileInput, ReadDetail } from "./types.js";

const IMAGE_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
];

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;
const MAX_MATCHES = 1000;

function detectImage(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  for (const sig of IMAGE_SIGNATURES) {
    if (!sig.bytes.every((byte, index) => buffer[index] === byte)) continue;
    if (sig.mime === "image/webp" && (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50)) continue;
    return sig.mime;
  }
  return null;
}

function renderLine(content: string): string {
  return content;
}

function createMatcher(file: ReadFileInput): (line: string) => boolean {
  if (!file.search) throw new Error("Invalid input: search query MUST be provided when search mode is used.");
  const needle = file.search.toLowerCase();
  return (line: string) => line.toLowerCase().includes(needle);
}

function searchFile(lines: string[], file: ReadFileInput): { output: string[]; matches: number } {
  const matcher = createMatcher(file);
  const cap = Math.min(Math.max(1, file.maxMatches ?? 200), MAX_MATCHES);
  const before = Math.max(0, file.contextBefore ?? 0);
  const after = Math.max(0, file.contextAfter ?? 0);
  const matches: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!matcher(lines[index])) continue;
    matches.push(index);
    if (matches.length >= cap) break;
  }

  const include = new Set<number>();
  for (const match of matches) {
    for (let index = Math.max(0, match - before); index <= Math.min(lines.length - 1, match + after); index += 1) {
      include.add(index);
    }
  }

  const sorted = [...include].sort((left, right) => left - right);
  const output = [`Search: '${file.search}' | Matches: ${matches.length}`];
  if (sorted.length === 0) return { output, matches: 0 };

  let previous = -2;
  for (const index of sorted) {
    if (previous !== -2 && index > previous + 1) output.push("...");
    output.push(renderLine(lines[index]));
    previous = index;
  }

  return { output, matches: matches.length };
}

function readRange(lines: string[], file: ReadFileInput): { output: string[]; truncated: boolean } {
  const start = Math.max(0, (file.offset ?? 1) - 1);
  if (start >= lines.length) throw new Error(`Invalid input: offset ${file.offset} is beyond end of file (${lines.length} lines).`);

  const implicit = file.limit === undefined && lines.length > 1000 ? 400 : undefined;
  const count = file.limit ?? implicit;
  const end = count !== undefined ? Math.min(lines.length, start + count) : lines.length;
  const output: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (let index = start; index < end; index += 1) {
    const line = renderLine(lines[index]);
    if (output.length >= MAX_LINES || bytes + line.length > MAX_BYTES) {
      truncated = true;
      output.push(`\n[Showing lines ${start + 1}-${index} of ${lines.length}. Use offset=${index + 1} to continue.]`);
      break;
    }
    output.push(line);
    bytes += line.length + 1;
  }

  if (!truncated && count !== undefined && start + count < lines.length) {
    const mode = file.limit === undefined ? "implicit safety limit" : "requested limit";
    output.push(`\n[${lines.length - (start + count)} more lines (${mode}). Use offset=${end + 1} to continue.]`);
  }

  return { output, truncated };
}

export async function executeRead(cwd: string, files: ReadFileInput[]) {
  const content: (TextContent | ImageContent)[] = [];
  const details: ReadDetail[] = [];

  for (const file of files) {
    try {
      const absolute = path.resolve(cwd, file.path.replace(/^@/, "").trim());
      await access(absolute, constants.R_OK);
      const buffer = await readFile(absolute);
      const mime = detectImage(buffer);

      if (files.length > 1) content.push({ type: "text", text: `--- ${file.path} ---` });

      if (mime) {
        if (file.search) throw new Error("Invalid input: search MUST NOT be used for image files.");
        content.push({ type: "text", text: `Read image file [${mime}]` });
        content.push({ type: "image", data: buffer.toString("base64"), mimeType: mime });
        details.push({ path: file.path });
        continue;
      }

      const lines = buffer.toString("utf-8").split("\n");
      if (file.search) {
        const result = searchFile(lines, file);
        content.push({ type: "text", text: result.output.join("\n") });
        details.push({ path: file.path, search: file.search, matches: result.matches });
        continue;
      }

      const result = readRange(lines, file);
      content.push({ type: "text", text: result.output.join("\n") });
      details.push({ path: file.path, offset: file.offset, limit: file.limit, truncated: result.truncated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content.push({ type: "text", text: `--- ${file.path} ---\nERROR: ${message}` });
      details.push({ path: file.path, error: message });
    }
  }

  return { content, details: { files: details } };
}
