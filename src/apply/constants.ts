// Marker constants for the patch format.
// This file is intentionally isolated because its string literals
// contain sequences (like triple-star prefixes) that confuse the
// apply_patch tool when used as context lines in edit hunks.
// Rarely needs changes — if you need to edit it, delete and recreate.
export const BEGIN_PATCH_MARKER = "\x2a\x2a\x2a Begin Patch";
export const END_PATCH_MARKER = "\x2a\x2a\x2a End Patch";
export const END_PATCH_MARKER_LOOSE = /^\*{2,3}\s*end\s*patch\s*$/i;
export const CREATE_FILE_MARKER = "\x2a\x2a\x2a Create File: ";
export const DELETE_FILE_MARKER = "\x2a\x2a\x2a Delete File: ";
export const EDIT_FILE_MARKER = "\x2a\x2a\x2a Edit File: ";
export const MOVE_FILE_MARKER = "\x2a\x2a\x2a Move File: ";
export const MOVE_TO_MARKER = "\x2a\x2a\x2a Move to: ";
export const EOF_MARKER = "\x2a\x2a\x2a End of File";
export const CHANGE_CONTEXT_MARKER = "@@ ";
export const EMPTY_CHANGE_CONTEXT_MARKER = "@@";

const M3 = "\x2a\x2a\x2a";
export const APPLY_PATCH_PROMPT_INSTRUCTIONS = [
  "## apply_patch",
  "",
  "The apply_patch tool MUST be used for all file modifications.",
  "The apply_patch envelope MUST support multi-file operations in one call, including Create File, Edit File, Move to, and Delete File sections.",
  "You MUST include all related file modifications for a user request in a single apply_patch call.",
  "You MUST NOT split related edits across sequential apply_patch calls unless the patch is too large to send safely.",
  "If a patch is too large, you MUST split by independent files and explain the split briefly.",
  "",
  "### Patch Envelope Structure",
  "A patch MUST start with a Begin marker and end with an End marker. Between these markers, you MAY include one or more file sections.",
  "",
  `${M3} Begin Patch`,
  "<file section 1>",
  "<file section 2>",
  "...",
  `${M3} End Patch`,
  "",
  "### File Sections",
  "Each section MUST begin with one of the following headers:",
`- ${M3} Create File: <path>       (Create a new file with '+' prefixed lines)`,
  `- ${M3} Delete File: <path>     (Remove an existing file)`,
  `- ${M3} Edit File: <path>       (Edit an existing file using diff hunks)`,
  "",
  "### Atomic Move & Edit",
  "When using Edit File, you MAY include a Move marker immediately after the header. This allows you to move/rename a file and apply edits to its content in a single atomic operation.",
  `- ${M3} Move to: <new path>     (MUST follow an Edit File header)`,
  "",
  "### Edit Hunks",
  "Each edit hunk MUST start with @@. The text after @@ is a positioning hint — the tool searches for this text in the file to locate the edit.",
  "",
  "Every body line MUST begin with exactly one prefix character, followed by the COMPLETE original line content INCLUDING its indentation:",
  "",
  "  ' ' + <original line>  → context (unchanged)",
  "  '-' + <original line>  → removal",
  "  '+' + <new line>        → addition",
  "",
  "IMPORTANT: The single-character prefix is PREPENDED to the line as it appears in the file. Do NOT strip or alter the line's leading whitespace.",
  "",
  "Example — if the file contains (4-space indent):",
  "    return x;",
  "",
  "Then in the patch:",
  "  CORRECT:  ' ' + '    return x;'  →  '     return x;'   (5 chars of leading space)",
  "  WRONG:    '    return x;'         (missing prefix — parser rejects)",
  "  WRONG:    ' return x;'            (prefix ate the indent — 3 spaces instead of 4)",
  "",
  "Additional rules:",
  "- Insertion-only hunks (only '+' lines) MUST include @@ context for deterministic placement.",
  "- Unprefixed lines after @@ are accepted as additions (lenient mode).",
  "- Use '+' alone (no content) for blank lines in Create File blocks.",
  "",
  "### Example: Multi-File Batch Operation",
  `${M3} Begin Patch`,
  `${M3} Create File: src/new-utility.ts`,
  "+export const util = () => true;",
  "+",
  `${M3} Edit File: src/old-name.ts`,
  `${M3} Move to: src/new-name.ts`,
  "@@ import { util }",
  '+import { util } from "./new-utility.js";',
  " ",
  `${M3} Delete File: temp-log.txt`,
  `${M3} End Patch`,
  "",
  "Important:",
     "- apply_patch returns current file state on failure. You SHOULD reuse returned context for immediate follow-up edits.",
  "- You SHALL NOT use the 'edit' or 'write' tools. They are disabled.",
  "- You SHOULD use apply_patch for file edits and SHOULD NOT use bash edits (sed -i, tee, echo >, printf >, etc.).", 
  "- All file paths MUST be relative to the current working directory.",
  "- Every line in a Create File block MUST start with '+'. Use '+' alone for blank lines.",
  "- You MUST prefer one atomic patch call per request.",
  "- You MAY split only when payload size or model limits require it.",
  "- If splitting is required, each call MUST contain a complete file section set for independent files.",
  "- You MUST NOT emit one apply_patch call per tiny edit when one envelope can contain all changes.",
].join("\n");
