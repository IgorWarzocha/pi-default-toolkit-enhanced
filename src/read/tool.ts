import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { normalizeInput } from "./normalizer.js";
import { executeRead } from "./executor.js";
import { renderRead } from "./renderer.js";
import { ReadFileSchema } from "./types.js";

export function registerReadTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "Read File(s)",
    description:
      "Read files with efficient plain output by default. You SHOULD batch related files into ONE call: [\"a.ts\", \"b.ts\", { path: \"c.ts\", offset: 10, limit: 50 }]. You MAY set includeLineNumbers=true to emit LINE|CONTENT format when line-addressed context is needed. For files larger than 1000 lines, the tool SHALL apply an implicit 400-line safety limit when limit is omitted. Regex search applies per line. You SHOULD NOT use bash (cat/sed/head) for inspection.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Single file path (string), a JSON object like { path }, or a JSON array of entries.",
        }),
        Type.Array(Type.Union([Type.String(), ReadFileSchema]), {
          description: "Multi-read payload. Each entry MAY include offset, limit, search, regex, and context window options.",
        }),
      ]),
    }),
    renderResult(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: Theme) {
      return renderRead(result, options, theme);
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
      return executeRead(ctx.cwd, files);
    },
  });
}
