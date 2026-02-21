import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { normalizeInput } from "./normalizer.js";
import { executeRead } from "./executor.js";
import { renderRead } from "./renderer.js";
import { ReadFileSchema } from "./types.js";

const entry = Type.Union([
  Type.String({
    description: "MAY be a file path string.",
  }),
  ReadFileSchema,
]);

const batch = Type.Array(entry, {
  minItems: 1,
  description: "Batch input. Each entry MAY be a path string or an object with path, offset, limit, search, contextBefore, contextAfter, maxMatches.",
});

const payload = Type.Union([
  entry,
  batch,
]);

export function registerReadTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "Read File(s)",
    description:
      "Read one or more text or image files. You MUST batch related files in one call. You MUST provide at least one of: files, path, paths, or file. Preferred call: read({ files: [\"a.ts\", \"b.ts\"] }). You MUST NOT call read with an empty object.",
    parameters: Type.Object({
      files: Type.Optional(payload),
      path: Type.Optional(Type.String({
        description: "Compat key. Single file path.",
      })),
      paths: Type.Optional(payload),
      file: Type.Optional(payload),
    }, { additionalProperties: true }),
    renderResult(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: Theme) {
      return renderRead(result, options, theme);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const files = normalizeInput(params);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "Invalid input: You MUST provide files, path, paths, or file with at least one readable entry." }],
          isError: true,
          details: { files: [] },
        };
      }
      return executeRead(ctx.cwd, files);
    },
  });
}
