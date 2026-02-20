import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";

const BASH_READ_PATTERNS = [
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:cat|head|tail|less|more|nl)\b/,
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?sed\b(?=.*(?:^|\s)-n(?:\s|$))(?=.*\bp(?:\s|$|'|"))/, 
];

const BASH_NUDGE = "Note: You SHOULD use read for file inspection because it provides multi-file reads, offset/limit, and in-file search with line-addressed output that apply_patch can consume. You SHOULD NOT use bash for file inspection when read can access the target files.";
const BATCH_NUDGE = "Note: You SHOULD batch related file inspections into one read call (array input) instead of one-file-at-a-time reads.";

function matchesBashRead(command: string): boolean {
  const chains = command.trim().split(/&&|\|\||;/g).map((value) => value.trim()).filter(Boolean);
  for (const chain of chains) {
    const first = chain.split("|")[0].trim();
    if (BASH_READ_PATTERNS.some((pattern) => pattern.test(first))) return true;
  }
  return false;
}

function countFiles(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object" && value !== null) return 1;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  if ((trimmed.startsWith("[") || trimmed.startsWith("{"))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.length;
      if (typeof parsed === "object" && parsed !== null) return 1;
    } catch {
      return 1;
    }
  }
  return 1;
}

function isSingleReadInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const record = input as Record<string, unknown>;
  return countFiles(record.files) === 1;
}

export function setupReadGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if ((event.toolName === "read" || event.toolName === "apply_patch") && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }
  });

  pi.on("tool_result", (event, ctx) => {
    if ((event.toolName === "read" || event.toolName === "apply_patch") && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }

    if (event.toolName === "bash" && !event.isError && event.input) {
      const command = (event.input.command as string) ?? "";
      if (matchesBashRead(command)) {
        const existing: (TextContent | ImageContent)[] = Array.isArray(event.content) ? event.content : [];
        return {
          content: [...existing, { type: "text" as const, text: `\n${BASH_NUDGE}` }],
        };
      }
    }

    if (event.toolName === "read" && !event.isError && event.input && isSingleReadInput(event.input)) {
      const existing: (TextContent | ImageContent)[] = Array.isArray(event.content) ? event.content : [];
      return {
        content: [...existing, { type: "text" as const, text: `\n${BATCH_NUDGE}` }],
      };
    }
  });
}
