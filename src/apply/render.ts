import { keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { ApplyResponse } from "./types.js";

function splitContentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function formatDiffLine(prefix: "+" | "-" | " ", lineNumber: number | undefined, width: number, text: string): string {
  const num = lineNumber === undefined ? "".padStart(width, " ") : String(lineNumber).padStart(width, " ");
  return `${prefix}${num} ${text}`;
}

export function buildNumberedDiff(oldContent: string, newContent: string): string {
  const oldLines = splitContentLines(oldContent);
  const newLines = splitContentLines(newContent);
  if (oldLines.length === 0 && newLines.length === 0) return "";
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;
  if (start === oldLines.length && start === newLines.length) return formatDiffLine(" ", 1, 1, "(no changes)");
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const width = String(Math.max(oldLines.length, newLines.length, 1)).length;
  const lines: string[] = [];
  const contextBeforeStart = Math.max(0, start - 3);
  if (contextBeforeStart > 0) lines.push(formatDiffLine(" ", undefined, width, "..."));
  for (let index = contextBeforeStart; index < start; index += 1) lines.push(formatDiffLine(" ", index + 1, width, oldLines[index]));
  for (let index = start; index <= oldEnd; index += 1) lines.push(formatDiffLine("-", index + 1, width, oldLines[index]));
  for (let index = start; index <= newEnd; index += 1) lines.push(formatDiffLine("+", index + 1, width, newLines[index]));
  const suffixStart = oldEnd + 1;
  const suffixShownEnd = Math.min(oldLines.length, suffixStart + 3);
  for (let index = suffixStart; index < suffixShownEnd; index += 1) lines.push(formatDiffLine(" ", index + 1, width, oldLines[index]));
  if (suffixShownEnd < oldLines.length) lines.push(formatDiffLine(" ", undefined, width, "..."));
  return lines.join("\n");
}

export function formatSummary(summary: ApplySummary): string {
  const lines: string[] = [];
  

  const successCount = (summary.created?.length ?? 0) + (summary.edited?.length ?? 0) + (summary.moved?.length ?? 0) + (summary.deleted?.length ?? 0);
  const failedCount = summary.failed?.length ?? 0;
  const title = failedCount === 0
    ? "SUCCESS:"
    : successCount === 0
      ? "FAILED:"
      : "PARTIAL SUCCESS:";
  lines.push(title);
  if (summary.created.length > 0) lines.push(`CREATED (${summary.created.length}): ${summary.created.join(", ")}`);
  if (summary.edited.length > 0) lines.push(`EDITED (${summary.edited.length}): ${summary.edited.join(", ")}`);
  if (summary.moved.length > 0) lines.push(`MOVED (${summary.moved.length}): ${summary.moved.join(", ")}`);
  if (summary.deleted.length > 0) lines.push(`DELETED (${summary.deleted.length}): ${summary.deleted.join(", ")}`);
  if (successCount === 0 && failedCount === 0) lines.push("NO-OP: No file operations were applied.");
  
  if (summary.failed?.length > 0) {
    lines.push("\nFAILURES:");
    for (const failed of summary.failed) {
      lines.push(`- ${failed.path}`);
      lines.push(failed.error);
      if (!failed.error.includes("CURRENT FILE STATE:") && failed.actual && failed.actual.length > 0) {
        lines.push("CURRENT FILE STATE:");
        const limit = Math.min(12, failed.actual.length);
        for (let index = 0; index < limit; index += 1) lines.push(failed.actual[index]);
        if (failed.actual.length > limit) lines.push(`... (${failed.actual.length - limit} more lines)`);
      }
      if (failed.suggest) lines.push(`HINT: ${failed.suggest}`);
    }
  }
  
  return `${lines.join("\n")}\n`;
}

export function renderApplyPatchCall(args: unknown, parsePatch: (text: string) => any[], theme: any): Text {
  const patchText = typeof (args as { patchText?: unknown })?.patchText === "string"
    ? ((args as { patchText?: string }).patchText ?? "")
    : "";
  if (!patchText) return new Text(`${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", "(awaiting patch)")}`, 0, 0);
  try {
    const hunks = parsePatch(patchText);
    const createCount = hunks.filter((h: any) => h.type === "create").length;
    const editCount = hunks.filter((h: any) => h.type === "edit").length;
    const moveCount = hunks.filter((h: any) => h.type === "move").length;
    const deleteCount = hunks.filter((h: any) => h.type === "delete").length;
    const files = hunks.map((h: any) => h.filePath);
    const preview = files.slice(0, 3).join(", ");
    const suffix = files.length > 3 ? `, +${files.length - 3} more` : "";
        const opSummary = `C:${createCount} E:${editCount} MV:${moveCount} D:${deleteCount}`;
    return new Text(`${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", `(${opSummary})`)}${preview ? `\n${theme.fg("accent", preview)}${theme.fg("muted", suffix)}` : ""}`, 0, 0);
  } catch {
    return new Text(`${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", "(patching)")}`, 0, 0);
  }
}

function collapseText(text: string, expanded: boolean): { text: string; trimmed: boolean; hidden: number } {
  if (expanded) return { text, trimmed: false, hidden: 0 };
  const lines = text.split("\n");
  const limit = 18;
  if (lines.length <= limit) return { text, trimmed: false, hidden: 0 };
  return { text: lines.slice(0, limit).join("\n"), trimmed: true, hidden: lines.length - limit };
}

function collapseError(text: string, expanded: boolean): string {
  if (expanded) return text;
  const lines = text.split("\n");
  const limit = 6;
  if (lines.length <= limit) return text;
  const head = lines.slice(0, limit).join("\n");
  return `${head}\n... (${lines.length - limit} more lines, ${keyHint("expandTools", "to expand")})`;
}

function colorizeSummary(text: string, tone: "success" | "warning" | "error", theme: any, partial: boolean): string {
  if (!partial) {
    return theme.fg(tone, text);
  }
  const lines = text.split("\n");
  const out: string[] = [];
  let failures = false;
  for (const line of lines) {
    if (line.trim() === "FAILURES:") {
      failures = true;
      out.push(theme.fg("error", line));
      continue;
    }
    if (failures && line.trim().length > 0) {
      out.push(theme.fg("error", line));
      continue;
    }
    out.push(theme.fg("success", line));
  }
  return out.join("\n");
}

export function renderApplyPatchResult(result: any, expanded: boolean, isPartial: boolean, theme: any): Text {
  const rawTextContent = (result.content ?? [])
    .filter((block: any) => block.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text ?? "")
    .join("\n")
    .trim();
  const textContent = rawTextContent;
  const response = result.details as ApplyResponse;
  const successCount = response.files.filter((item) => item.status !== "rejected").length;
  const failedCount = response.errors.length;
  const allFailed = result.isError === true || (failedCount > 0 && successCount === 0);
  if (allFailed) {
    return new Text(theme.fg("error", collapseError(textContent || "Error", expanded)), 0, 0);
  }
  if (isPartial) return new Text(theme.fg("warning", collapseError(textContent || "Applying patch...", expanded)), 0, 0);
  const tone = failedCount > 0 ? "warning" : "success";
  let output = "";
  if (textContent) {
    const collapsed = collapseText(textContent, expanded);
    const partial = failedCount > 0 && successCount > 0;
    output = colorizeSummary(collapsed.text, tone, theme, partial);
    if (collapsed.trimmed) {
      output += `\n${theme.fg("muted", `... (${collapsed.hidden} more lines, ${keyHint("expandTools", "to expand")})`)}`;
    }
  }
  return new Text(output || theme.fg("toolOutput", "No output"), 0, 0);
}
