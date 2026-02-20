import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parsePatch } from "./parser.js";
import { applyHunks } from "./index.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./render.js";
import { enrichParseError } from "./parse-recovery.js";

export function registerApplyTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description: `Apply file modifications using anchored diffs with automatic Biome formatting. The tool SHALL return updated LINE anchors upon success. You MUST use these returned anchors for all subsequent edits to the same files. You SHALL NOT re-read files after successful application. STRUCTURE: The patchText MUST begin with '*** Begin Patch' and end with '*** End Patch'. SECTIONS: Each file modification MUST use one of: '*** Create File: <path>', '*** Edit File: <path>', '*** Delete File: <path>', or '*** Move File: <path>' followed by '*** Move to: <new-path>'. HUNKS: Each Edit File section MAY contain one or more hunks starting with '@@ <context>' for positioning. Body lines: Context (' ') and removal ('-') lines MUST include the exact LINE| anchor from the read tool. Addition ('+') lines MUST NOT include anchors. You MUST batch ALL file changes into a single apply_patch call.`,
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "The patch envelope. This parameter MUST be a string starting with exactly '*** Begin Patch' and ending with exactly '*** End Patch'. Inside the envelope: file sections using '*** Create File: <path>', '*** Edit File: <path>', '*** Delete File: <path>', or '*** Move File: <path>'. For Edit File sections: hunk markers '@@ <context>' are OPTIONAL but RECOMMENDED for positioning. Body lines MUST use prefixes: ' ' for context lines with LINE| anchor, '-' for removal lines with LINE| anchor, '+' for addition lines WITHOUT anchors.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const hunks = parsePatch(params.patchText);
        const summary = await applyHunks(ctx.cwd, hunks);
        const successCount = summary.created.length + summary.edited.length + summary.moved.length + summary.deleted.length;
        const allFailed = summary.failed.length > 0 && successCount === 0;
        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          isError: allFailed,
          details: summary,
        };
      } catch (error) {
        const errorMessage = await enrichParseError(ctx.cwd, params.patchText, error);
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
