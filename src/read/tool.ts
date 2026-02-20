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
      "Read one or more text or image files. You MUST batch related files in one call. Input SHOULD be an array mixing path strings and per-file objects when needed: [\"a.ts\", \"b.ts\", { path: \"c.ts\", offset: 10, limit: 50, search: \"token\" }].", 
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Input MAY be a file path string.",
        }),
        ReadFileSchema,
        Type.Array(Type.Union([Type.String(), ReadFileSchema]), {
          description: "Batch input. Each entry MAY be a path string or an object with path, offset, limit, search, contextBefore, contextAfter, maxMatches.",
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
