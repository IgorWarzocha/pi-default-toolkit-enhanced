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
      "Read one or more files. Output MUST be plain text. You SHOULD batch related files in one call: [\"a.ts\", \"b.ts\", { path: \"c.ts\", offset: 10, limit: 50 }]. For files over 1000 lines, an implicit 400-line safety limit SHALL apply when limit is omitted. Search SHALL evaluate per line and SHALL be case-insensitive.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Input MUST be one of: file path string, JSON object { path, ... }, or JSON array of entries.",
        }),
        Type.Array(Type.Union([Type.String(), ReadFileSchema]), {
          description: "Multi-read payload. Each entry MAY include offset, limit, search, contextBefore, contextAfter, maxMatches.",
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
          content: [{ type: "text", text: "Invalid input: files MUST resolve to at least one readable entry." }],
          isError: true,
          details: { files: [] },
        };
      }
      return executeRead(ctx.cwd, files);
    },
  });
}
