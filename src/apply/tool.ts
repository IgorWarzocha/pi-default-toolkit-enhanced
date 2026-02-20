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
    description: `Apply file modifications from a patch envelope. STRUCTURE: patchText MUST begin with '*** Begin Patch' and end with '*** End Patch'. SECTIONS: each file change MUST use one of: '*** Create File: <path>', '*** Edit File: <path>', '*** Delete File: <path>', or '*** Move File: <path>' plus '*** Move to: <new-path>'. HUNKS: Edit File sections MAY use '@@ <context>' and MAY use either strict prefixed diff lines (' ', '+', '-') or lenient body lines (unprefixed lines are treated as additions). Insertion-only hunks MUST include @@ context for deterministic placement. Context/removal lines SHOULD be plain content. Range replacement is supported by providing first and last removal lines. You MUST batch related file changes in one apply_patch call.`,
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "Patch envelope text. It MUST start with '*** Begin Patch' and end with '*** End Patch'. Edit hunks MAY use '@@ <context>'. Hunk bodies SHOULD use ' ', '+', '-' prefixes, but unprefixed lines are accepted as additions. Insertion-only hunks MUST include @@ context. Context/removal lines SHOULD be plain content.",
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
