import type { ReadFileInput } from "./types.js";

export function normalizeInput(input: unknown): ReadFileInput[] {
  let normalized = input;

  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        normalized = JSON.parse(trimmed);
      } catch {
        return [{ path: trimmed }];
      }
    } else {
      return [{ path: trimmed }];
    }
  }

  if (Array.isArray(normalized)) {
    return normalized.map((value) => typeof value === "string" ? { path: value } : value as ReadFileInput);
  }

  if (typeof normalized === "object" && normalized !== null) {
    if ("files" in normalized && Array.isArray((normalized as Record<string, unknown>).files)) {
      return (normalized as Record<string, unknown[]>).files.map((value) =>
        typeof value === "string" ? { path: value } : value as ReadFileInput,
      );
    }
    if ("path" in normalized) return [normalized as ReadFileInput];
  }

  return [];
}
