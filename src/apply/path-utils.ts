import * as path from "node:path";

export function ensureRelativePatchPath(patchPath: string): string {
  const normalized = patchPath.replace(/^@/, "").trim();
  if (!normalized)
    throw new Error("Patch path MUST NOT be empty. You MUST provide a relative file path.");
  return normalized;
}

export function resolvePatchPath(cwd: string, patchPath: string): string {
  const normalized = ensureRelativePatchPath(patchPath);
  return path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
}
