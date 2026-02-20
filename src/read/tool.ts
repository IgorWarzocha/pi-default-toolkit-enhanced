import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { normalizeInput } from "./normalizer.js";
import { executeReadHash } from "./executor.js";
import { renderReadHash } from "./renderer.js";
import { HashFileSchema } from "./types.js";

export function registerReadHashTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "Read File(s)",
    description:
      "Read files with LINE:HASH|CONTENT output for apply_patch. Format: <line>:<2-hex-chars>|<content>. You MUST batch ALL files into ONE call: [\"a.ts\", \"b.ts\", { path: \"c.ts\", offset: 10, limit: 50 }]. You MUST copy anchored lines EXACTLY for edit hunk context (' ') and removal ('-'). You MUST NOT prefix '+' addition lines. You MUST NOT re-read files after successful apply_patch — the tool SHALL return updated anchors. You SHOULD NOT use bash (cat/sed/head) for inspection.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Single file path (string), a JSON object like { path }, or a JSON array of entries.",
        }),
        Type.Array(Type.Union([Type.String(), HashFileSchema]), {
          description: "Multi-read payload. Each entry MAY include offset, limit, search, regex, and context window options.",
        }),
      ]),
    }),
    renderResult(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: Theme) {
      return renderReadHash(result, options, theme);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const files = normalizeInput(params.files);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "Invalid input: no readable files provided." }],
          isError: true,
          details: { files: [] },
        };
      }
      return executeReadHash(ctx.cwd, files);
    },
  });
}
