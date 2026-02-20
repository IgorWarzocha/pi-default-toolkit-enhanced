import type { Mode } from "./types.js";

export const HEAD_DEFAULT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.`;

export const HEAD_RFC_XML = `<role>
You are an expert coding assistant operating inside pi, a coding agent harness. You MUST execute tasks end-to-end with the active tools and repository constraints.
</role>`;

export const DEFAULT_TOOLS = `Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files`;

export const RFC_XML_TOOLS = `<tools>
- read: Efficient multi-file reader for text and image files.
- bash: Execute bash commands (ls, grep, find, etc.).
- edit: Make surgical edits to files (find exact text and replace).
- write: Create or overwrite files.
</tools>

<guidelines>
- Be concise. Show file paths clearly.
- You MUST use read for inspection instead of cat or sed.
- You MUST batch read calls for related files.
- You MUST use mixed read modes in one call when practical (path strings + per-file objects).
- read supports standard files and images.
- You MUST use edit for precise in-place changes.
- You MUST use write only for new files or complete rewrites.
- Non-user-facing markdown artifacts generated for agent workflows SHOULD use XML section blocks and RFC 2119 keywords.
</guidelines>`;

export const READ_TOOLS = `Available tools:
- read: Efficient multi-file reader for text and image files. You MAY mix path strings and per-file objects in one batched call.
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You MUST use this tool instead of cat or sed.
- You MUST batch read calls for related files.
- You MUST take advantage of mixed read modes when practical (path strings + per-file objects).
- read supports both standard files and images.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files`;

export const APPLY_TOOLS = `Available tools:
- apply_patch: Apply file modifications from one patch envelope. patchText MUST begin with '*** Begin Patch' and end with '*** End Patch'. The envelope MAY include Create/Edit/Delete/Move operations across multiple files.

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use apply_patch for all destructive file operations.
- You MUST batch all related file changes in one patch envelope.
- When summarizing your actions, output plain text directly.
- Be concise in your responses
- Show file paths clearly when working with files`;

export const BOTH_TOOLS = `<tools>
Available tools:
- read: Efficient multi-file reader for text and image files. You MAY mix path strings and per-file objects in one batched call.
- apply_patch: Edit files. patchText MUST begin with '*** Begin Patch' and end with '*** End Patch'. You MUST batch ALL related file changes in one envelope.
- bash: Execute bash commands.
</tools>

<guidelines>
- Be concise. Show file paths clearly.
- read and apply_patch MUST be batched.
- You MUST use read for inspection instead of cat or sed.
- You MUST batch read calls for related files.
- You MUST take advantage of mixed read modes when practical (path strings + per-file objects).
- read supports both standard files and images.
- You MUST use apply_patch for modifications.
- You MUST NOT use bash redirects or shell text editors for file modification.
- Non-user-facing markdown artifacts generated for agent workflows SHOULD use XML section blocks and RFC 2119 keywords.
- Output MUST stay technical and compact.
</guidelines>`;

export const TAIL_DEFAULT = `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):`;

export const TAIL_RFC_XML = `<pi_documentation>
Pi documentation
</pi_documentation>`;

function head(mode: Mode): string {
  if (mode === "rfc_xml" || mode === "both") return HEAD_RFC_XML;
  return HEAD_DEFAULT;
}

export function block(mode: Mode): string {
  if (mode === "read") return READ_TOOLS;
  if (mode === "apply_patch") return APPLY_TOOLS;
  if (mode === "both") return BOTH_TOOLS;
  if (mode === "rfc_xml") return RFC_XML_TOOLS;
  return DEFAULT_TOOLS;
}

function boundaries(
  prompt: string,
): { toolsStart: number; docsStart: number; docsEnd: number } | undefined {
  const toolsStart = prompt.indexOf("\n\nAvailable tools:\n");
  const docsStart = prompt.indexOf("\n\nPi documentation", toolsStart + 1);
  if (toolsStart === -1 || docsStart === -1 || docsStart <= toolsStart) {
    return undefined;
  }
  const contextStart = prompt.indexOf("\n\n# Project Context", docsStart + 1);
  const timeStart = prompt.indexOf("\nCurrent date and time:", docsStart + 1);
  let docsEnd = prompt.length;
  if (contextStart !== -1) {
    docsEnd = contextStart;
  }
  if (timeStart !== -1 && timeStart < docsEnd) {
    docsEnd = timeStart;
  }
  return { toolsStart, docsStart, docsEnd };
}

function docs(prompt: string, docsStart: number, docsEnd: number): string {
  return prompt.slice(docsStart + 2, docsEnd).trim();
}

function xmlDocs(prompt: string, docsStart: number, docsEnd: number): string {
  return `<pi_documentation>\n${docs(prompt, docsStart, docsEnd)}\n</pi_documentation>`;
}

export function compose(mode: Mode, prompt: string): string {
  const cuts = boundaries(prompt);
  if (!cuts) {
    return `${head(mode)}\n\n${block(mode)}\n\n${mode === "rfc_xml" || mode === "both" ? TAIL_RFC_XML : TAIL_DEFAULT}`;
  }
  const rest = prompt.slice(cuts.docsEnd);
  const tail =
    mode === "rfc_xml" || mode === "both"
      ? xmlDocs(prompt, cuts.docsStart, cuts.docsEnd)
      : docs(prompt, cuts.docsStart, cuts.docsEnd);
  return `${head(mode)}\n\n${block(mode)}\n\n${tail}${rest}`;
}

export function inject(prompt: string, mode: Mode): string {
  const cuts = boundaries(prompt);
  if (!cuts) {
    return prompt;
  }
  const headText = prompt.slice(0, cuts.toolsStart).trimEnd();
  const rest = prompt.slice(cuts.docsEnd);
  const tail =
    mode === "rfc_xml" || mode === "both"
      ? xmlDocs(prompt, cuts.docsStart, cuts.docsEnd)
      : docs(prompt, cuts.docsStart, cuts.docsEnd);
  return `${headText}\n\n${block(mode)}\n\n${tail}${rest}`;
}
