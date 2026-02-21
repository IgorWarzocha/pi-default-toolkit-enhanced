import type { ReadFileInput } from "./types.js";

function parseLoose(input: string): unknown {
  const trimmed = input.trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {}
  try {
    return JSON.parse(trimmed.replace(/'/g, '"'));
  } catch {}
  const paths: ReadFileInput[] = [];
  const pathField = /["']path["']\s*:\s*["']([^"']+)["']/g;
  for (const match of trimmed.matchAll(pathField)) {
    const path = match[1]?.trim();
    if (!path) continue;
    paths.push({ path });
  }
  if (paths.length > 0) return paths;
  const quoted = /["']([^"']+)["']/g;
  for (const match of trimmed.matchAll(quoted)) {
    const path = match[1]?.trim();
    if (!path) continue;
    paths.push({ path });
  }
  if (paths.length > 0) return paths;
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function item(value: unknown): ReadFileInput | undefined {
  if (typeof value === "string") {
    const path = text(value);
    if (!path) return undefined;
    return { path };
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const path = text(record.path);
  if (!path) return undefined;
  const next: ReadFileInput = { path };
  const offset = number(record.offset);
  if (offset !== undefined) next.offset = offset;
  const limit = number(record.limit);
  if (limit !== undefined) next.limit = limit;
  const search = text(record.search);
  if (search !== undefined) next.search = search;
  const contextBefore = number(record.contextBefore);
  if (contextBefore !== undefined) next.contextBefore = contextBefore;
  const contextAfter = number(record.contextAfter);
  if (contextAfter !== undefined) next.contextAfter = contextAfter;
  const maxMatches = number(record.maxMatches);
  if (maxMatches !== undefined) next.maxMatches = maxMatches;
  return next;
}

function list(value: unknown): ReadFileInput[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      const loose = parseLoose(value);
      if (loose !== undefined) {
        return list(loose);
      }
    }
    const one = item(value);
    if (!one) return [];
    return [one];
  }
  const out: ReadFileInput[] = [];
  for (const entry of value) {
    const next = item(entry);
    if (!next) continue;
    out.push(next);
  }
  return out;
}

export function normalizeInput(input: unknown): ReadFileInput[] {
  let normalized = input;

  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    if (trimmed.length === 0) return [];
    const loose = parseLoose(trimmed);
    if (loose !== undefined) {
      normalized = loose;
    } else {
      return [{ path: trimmed }];
    }
  }

  if (Array.isArray(normalized)) {
    return list(normalized);
  }

  if (typeof normalized !== "object" || normalized === null) {
    return [];
  }

  const record = normalized as Record<string, unknown>;

  if ("files" in record) {
    const files = list(record.files);
    if (files.length > 0) return files;
  }
  if ("paths" in record) {
    const paths = list(record.paths);
    if (paths.length > 0) return paths;
  }
  if ("file" in record) {
    const file = list(record.file);
    if (file.length > 0) return file;
  }
  if ("path" in record) {
    const direct = item(record);
    if (direct) {
      const nested = parseLoose(direct.path);
      if (nested !== undefined) {
        const parsed = list(nested);
        if (parsed.length > 0) return parsed;
      }
      return [direct];
    }
  }

  return [];
}
