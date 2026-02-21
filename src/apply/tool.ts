import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parsePatch } from "./parser.js";
import { applyHunks } from "./index.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./render.js";
import { enrichParseError } from "./parse-recovery.js";
import type { ApplySummary, Hunk } from "./types.js";

function isBegin(line: string): boolean {
  return /^(?:\*{3}|#{3})\s*Begin Patch(?:\s*(?:\*{3}|#{3}))?\s*$/i.test(line.trim());
}

function isEnd(line: string): boolean {
  return /^(?:\*{3}|#{3})\s*End Patch(?:\s*(?:\*{3}|#{3}))?\s*$/i.test(line.trim());
}

function parseSectionHeader(line: string): { kind: "Create File" | "Edit File" | "Delete File" | "Move File"; path: string } | undefined {
  const match = line.trim().match(/^(?:(?:\*{3}|#{3})\s*)?(Create File|Create|Edit File|Edit|Delete File|Delete|Move File|Move)\s*:\s*(.+)$/i);
  if (!match) return undefined;
  const token = match[1].toLowerCase();
  const path = match[2].replace(/\s*(?:\*{3}|#{3})\s*$/, "").trim();
  if (token === "create file" || token === "create") return { kind: "Create File", path };
  if (token === "edit file" || token === "edit") return { kind: "Edit File", path };
  if (token === "delete file" || token === "delete") return { kind: "Delete File", path };
  return { kind: "Move File", path };
}

function normalizePatchText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed === "***") {
      index += 1;
      continue;
    }
    if ((trimmed === "+" || trimmed === "-") && index + 1 < lines.length) {
      const next = lines[index + 1] ?? "";
      const nextTrimmed = next.trim();
      const isPatchLine = next.startsWith("+") || next.startsWith("-") || next.startsWith(" ");
      if (nextTrimmed.length > 0 && !isPatchLine && !isBegin(next) && !isEnd(next) && !nextTrimmed.startsWith("*** ") && !nextTrimmed.startsWith("### ")) {
        out.push(`${trimmed}${next}`);
        index += 2;
        continue;
      }
    }
    const marker = trimmed.match(/^\[(CREATE|EDIT|DELETE|MOVE)\]$/i);
    if (marker) {
      const next = lines[index + 1] ?? "";
      if (next.trim().startsWith("---")) {
        const fromRaw = next.trim().replace(/^---\s*/, "").replace(/^a\//, "").replace(/^\/dev\/null$/, "").trim();
        const plus = lines[index + 2] ?? "";
        const toRaw = plus.trim().replace(/^\+\+\+\s*/, "").replace(/^b\//, "").trim();
        const target = marker[1].toLowerCase() === "create" ? toRaw : marker[1].toLowerCase() === "delete" ? fromRaw : toRaw || fromRaw;
        if (target.length > 0) {
          const kind = marker[1].toLowerCase() === "create" ? "Create File" : marker[1].toLowerCase() === "edit" ? "Edit File" : marker[1].toLowerCase() === "delete" ? "Delete File" : "Move File";
          out.push(`*** ${kind}: ${target}`);
          index += 3;
          continue;
        }
      }
    }
    const fromOnly = trimmed.match(/^---\s+(.+)$/);
    const toOnly = (lines[index + 1] ?? "").trim().match(/^\+\+\+\s+(.+)$/);
    if (fromOnly && toOnly) {
      const fromPath = fromOnly[1].replace(/^a\//, "").trim();
      const toPath = toOnly[1].replace(/^b\//, "").trim();
      if (fromPath === "/dev/null") {
        out.push(`*** Create File: ${toPath}`);
        index += 2;
        continue;
      }
      if (toPath === "/dev/null") {
        out.push(`*** Delete File: ${fromPath}`);
        index += 2;
        continue;
      }
      out.push(`*** Edit File: ${toPath}`);
      index += 2;
      continue;
    }
    out.push(line);
    index += 1;
  }
  return out.join("\n");
}

function splitSections(text: string): Array<{ path: string; patch: string }> {
  const normalized = normalizePatchText(text);
  const lines = normalized.split("\n");
  const out: Array<{ path: string; patch: string }> = [];
  let index = 0;
  while (index < lines.length && lines[index].trim().length === 0) {
    index += 1;
  }
  if (!isBegin(lines[index] ?? "")) {
    return out;
  }
  index += 1;
  let activePath = "<unknown>";
  let active: string[] = [];
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const header = parseSectionHeader(line);
    if (isEnd(line)) {
      if (active.length > 0) {
        out.push({ path: activePath, patch: ["*** Begin Patch", ...active, "*** End Patch"].join("\n") });
        active = [];
      }
      index += 1;
      continue;
    }
    if (header) {
      if (active.length > 0) {
        out.push({ path: activePath, patch: ["*** Begin Patch", ...active, "*** End Patch"].join("\n") });
      }
      active = [`*** ${header.kind}: ${header.path}`];
      activePath = header.path;
      index += 1;
      continue;
    }
    if (active.length > 0) {
      active.push(line);
    }
    index += 1;
  }
  if (active.length > 0) {
    out.push({ path: activePath, patch: ["*** Begin Patch", ...active, "*** End Patch"].join("\n") });
  }
  return out;
}

function baseSummary(): ApplySummary {
  return { created: [], edited: [], moved: [], deleted: [], failed: [], live: [], fileDiffs: [], noops: [], hunkResults: [] };
}

function merge(lhs: ApplySummary, rhs: ApplySummary): ApplySummary {
  return {
    created: [...lhs.created, ...rhs.created],
    edited: [...lhs.edited, ...rhs.edited],
    moved: [...lhs.moved, ...rhs.moved],
    deleted: [...lhs.deleted, ...rhs.deleted],
    failed: [...lhs.failed, ...rhs.failed],
    live: [...lhs.live, ...rhs.live],
    fileDiffs: [...lhs.fileDiffs, ...rhs.fileDiffs],
    noops: [...lhs.noops, ...rhs.noops],
    hunkResults: [...lhs.hunkResults, ...rhs.hunkResults],
  };
}

function successCount(summary: ApplySummary): number {
  return summary.created.length + summary.edited.length + summary.moved.length + summary.deleted.length;
}

export function registerApplyTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description: `Apply batched file modifications from one patch envelope. You MUST call this tool with patchText, for example: apply_patch({ patchText: '*** Begin Patch\n*** Edit File: a.ts\n@@\n-old\n+new\n*** End Patch' }). patchText MUST start with '*** Begin Patch' and MUST end with '*** End Patch'. You MUST batch related file changes in one apply_patch call. You MAY include Create/Edit/Delete/Move operations across multiple files. Each '*** Edit File:' section MUST include at least one valid hunk. Edit hunk body lines MUST use ' ' (context), '-' (removal), or '+' (addition). Insertion-only hunks MUST include @@ context.`,
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "Patch envelope text. It MUST start with '*** Begin Patch' and end with '*** End Patch'. You MAY include Create/Edit/Delete/Move sections for multiple files. Each Edit File section MUST include at least one valid hunk. Edit hunk body lines MUST be prefixed with ' ', '-', or '+'. Insertion-only hunks MUST include @@ context. You MUST NOT pass an empty patchText.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sections = splitSections(params.patchText);
      if (sections.length === 0) {
        const base = "Patch envelope is invalid. You MUST provide at least one file section.";
        const hint = "You MUST use canonical section headers: '*** Create File: <path>', '*** Edit File: <path>', '*** Delete File: <path>', or '*** Move File: <path>'. For Create File, you MUST prefix every content line with '+'. You MUST NOT use @@ in Create File sections.";
        const errorMessage = await enrichParseError(ctx.cwd, params.patchText, new Error(`${base}\n${hint}`));
        const summary = baseSummary();
        summary.failed.push({ path: "<patch>", error: errorMessage });
        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          isError: true,
          details: summary,
        };
      }
      let parsed: Hunk[] = [];
      const parseFailed: ApplySummary = baseSummary();
      for (const section of sections) {
        try {
          const hunks = parsePatch(section.patch);
          parsed = [...parsed, ...hunks];
        } catch (error) {
          const errorMessage = await enrichParseError(ctx.cwd, section.patch, error);
          parseFailed.failed.push({ path: section.path, error: errorMessage });
        }
      }
      if (parsed.length === 0) {
        const summary = parseFailed;
        const allFailed = summary.failed.length > 0 && successCount(summary) === 0;
        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          isError: allFailed,
          details: summary,
        };
      }
      const applied = await applyHunks(ctx.cwd, parsed);
      const summary = merge(applied, parseFailed);
      const allFailed = summary.failed.length > 0 && successCount(summary) === 0;
      return {
        content: [{ type: "text", text: formatSummary(summary) }],
        isError: allFailed,
        details: summary,
      };
    },
  });
}
