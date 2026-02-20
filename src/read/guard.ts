import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";

const BASH_READ_PATTERNS = [
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:cat|head|tail|less|more|nl)\b/,
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?sed\b(?=.*(?:^|\s)-n(?:\s|$))(?=.*\bp(?:\s|$|'|"))/, 
];

const BASH_NUDGE = "Note: You SHOULD use read for file inspection because it provides multi-file reads, offset/limit, and in-file search with LINE| anchors REQUIRED by apply_patch. You SHOULD NOT use bash for file inspection when read can access the target files.";
const BATCH_NUDGE = "Note: You SHOULD batch related file inspections into one read call (array input) instead of one-file-at-a-time reads.";

function matchesBashRead(command: string): boolean {
  const chains = command.trim().split(/&&|\|\||;/g).map((value) => value.trim()).filter(Boolean);
  for (const chain of chains) {
    const first = chain.split("|")[0].trim();
    if (BASH_READ_PATTERNS.some((pattern) => pattern.test(first))) return true;
  }
  return false;
}

function isSingleReadInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const record = input as Record<string, unknown>;
  const files = record.files;
  if (typeof files === "string") return true;
  if (Array.isArray(files)) return files.length === 1;
  if (typeof files === "object" && files !== null) return true;
  return false;
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
