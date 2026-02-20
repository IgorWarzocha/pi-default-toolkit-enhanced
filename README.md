pi-hash

Pi extension providing high-reliability file edits through a relocation engine and line anchors.

Inspired by https://blog.can.ac/2026/02/12/the-harness-problem/

## Protocol: Line Anchors

Every line is addressed via a `LINE|CONTENT` anchor.
- Format: `LINE|CONTENT` (e.g., `1|# pi-hash`).
- Matching: Uses normalized content matching to handle minor formatting drift.

## Tooling

### `read`
- Returns anchored output for all file reads.
- Supports integrated `grep` with regex and context (`contextBefore`/`contextAfter`).
- Batches multiple file reads into a single tool result.

### `apply_patch`
- Relocation engine: Uses spiral search (+/- 100 lines) and unique-content fallback to find anchors if line numbers drift.
- Cumulative drift: Adjusts target lines for sequential chunks in the same file.
- Healing:
  - Indentation inheritance from original context.
  - Multi-line wrap restoration.
  - Automated merge expansion for single-line changes.
- Transactional: Per-file atomic edits. Results return live line anchors for subsequent modifications.

## Security

- Bash guard: Intercepts shell commands that attempt direct file writes (`tee`, `truncate`, `sed -i`, `dd of=`, and `>`/`>>` redirects), redirecting the agent to use `apply_patch`.

## Installation

Symlink the `pi-hash` directory into `.pi/extensions/`.
