import type { HashFileInput } from "./types.js";

export function normalizeInput(input: unknown): HashFileInput[] {
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
    return normalized.map((f) => (typeof f === "string" ? { path: f } : f as HashFileInput));
  }

  if (typeof normalized === "object" && normalized !== null) {
    if ("files" in normalized && Array.isArray((normalized as Record<string, unknown>).files)) {
      return (normalized as Record<string, unknown[]>).files.map((f) =>
        typeof f === "string" ? { path: f } : f as HashFileInput,
      );
    }
    if ("path" in normalized) {
      return [normalized as HashFileInput];
    }
  }

  return [];
}

