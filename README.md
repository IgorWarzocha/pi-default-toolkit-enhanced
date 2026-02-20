 pi-hash

 Pi extension providing high-reliability file edits through a "Relocation Engine" and line-based hashing.

 Inspired by https://blog.can.ac/2026/02/12/the-harness-problem/

 ## Protocol: Hashlines

 Every line is addressed via a `LINE:HASH` anchor.
 - **Format**: `LINE:HASH|CONTENT` (e.g., `1:a0|# pi-hash`).
 - **Hashing**: Uses `xxHash32` (or `FNV-1a` fallback) truncated to **2-character hex** (`00-ff`).
 - **Normalization**: Prior to hashing, lines undergo Unicode NFC normalization, smart-character conversion (quotes, dashes, ellipsis), and absolute whitespace stripping.

 ## Tooling

 ### `read`
 - Returns hashed output for all file reads.
 - Supports integrated `grep` with regex and context (`contextBefore`/`contextAfter`).
 - Batches multiple file reads into a single tool result.

 ### `apply_patch`
 - **Relocation Engine**: Employs a **spiral search** (+/- 100 lines) and unique-hash fallback to find anchors if line numbers have drifted.
 - **Cumulative Drift**: Adjusts target lines for sequential chunks in the same file.
 - **Healing**:
   - Indentation inheritance from original context.
   - Multi-line wrap restoration.
   - Automated merge expansion for single-line changes.
 - **Transactional**: Per-file atomic edits. Results return "Live Sync" anchors for subsequent modifications.

 ## Security

 - **Bash Guard**: Intercepts shell commands that attempt direct file writes (`tee`, `truncate`, `sed -i`, `dd of=`, and `>`/`>>` redirects), redirecting the agent to use `apply_patch`.

 ## Installation

 Symlink the `pi-hash` directory into `.pi/extensions/`.
