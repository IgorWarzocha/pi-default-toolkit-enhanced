/**
 * Detect if a bash command attempts to write files.
 * Strips quoted strings, splits on shell operators, and checks
 * command-name positions only — so file paths containing words
 * like "tee" won't cause false positives.
 *
 * Limitations (cannot catch):
 * - eval/bash -c with write commands inside the string argument
 * - Variable expansion: $CMD file where CMD resolves to a write command
 * - User-defined shell functions that wrap write operations
 */
export function detectBashWriteViolation(command: string): string | null {
  // 1. Strip quoted strings to avoid matching inside arguments
  const stripped = command
    .replace(/'[^']*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`[^`]*`/g, '""');

  // 2. Check for output redirects (> or >>) in unquoted portions
  //    Allow: < (input redirect), >&2 (fd redirect), > /dev/null
  const redirectMatch = stripped.match(/(?<![<&0-9])>{1,2}\s*(\S+)|<<\s*(\S+)/);
  if (redirectMatch) {
    const target = redirectMatch[1] || redirectMatch[2];
    if (target && target !== "/dev/null" && target !== "&1" && target !== "&2") {
      return "Output redirection (> or >>) or Heredoc (<<) detected. You SHALL NOT use bash to write files. You MUST use apply_patch for all file modifications.";
    }
  }

  // 3. Split on shell operators to isolate individual commands
  const segments = stripped.split(/\s*(?:\|(?!\|)|\|\||&&|;|\$\(|\(|\))\s*/);

  // Commands that always write files
  const forbiddenCommands = new Set(["tee", "truncate"]);

  for (const segment of segments) {
    let rest = segment.trim();
    if (!rest) continue;

    // Skip leading env assignments (VAR=val cmd) and command prefixes
    while (true) {
      const envMatch = rest.match(/^\w+=\S*\s+/);
      if (envMatch) {
        rest = rest.slice(envMatch[0].length);
        continue;
      }
      const prefixMatch = rest.match(/^(?:sudo|env|command|exec|nice|nohup|time|xargs)\s+/);
      if (prefixMatch) {
        rest = rest.slice(prefixMatch[0].length);
        continue;
      }
      break;
    }

    // Extract the command name (first word)
    const cmdMatch = rest.match(/^(\S+)/);
    if (!cmdMatch) continue;
    const cmdName = cmdMatch[1].replace(/^.*\//, ""); // strip path: /usr/bin/tee -> tee

    if (forbiddenCommands.has(cmdName)) {
      return `Command '${cmdName}' writes to files. You MUST use apply_patch for all file modifications. You MUST NOT use '${cmdName}' in bash.`;
    }

    // sed is only forbidden with -i (in-place editing); sed without -i is read-only
    if (cmdName === "sed" && /\s-[^\s]*i/.test(rest)) {
      return "Command 'sed -i' edits files in-place. You MUST use apply_patch instead. 'sed' without '-i' (print-only) is allowed.";
    }

    // dd is only forbidden with of= (output file)
    if (cmdName === "dd" && /\bof=/.test(rest)) {
      return "Command 'dd of=' writes to files. You MUST use apply_patch for all file modifications.";
    }
  }

  return null;
}
