# PRD: Mutation Engine (Apply)

This document defines the Hyper-Robust Mutation Engine for the `apply_patch` tool, ensuring 100% edit reliability through multi-layered verification and relocation.

## 1. Hunk Protocol
1. **Anchored Lines:** All context (` `) and removal (`-`) lines in a hunk MUST include the `LINEHASH|` prefix (e.g., `- 42abcd| old content`).
2. **Addition Lines:** Addition (`+`) lines MUST NOT include prefixes; they contain raw content to be inserted.
3. **Validation:** The engine MUST strip the `LINEHASH|` prefix from hunk lines to extract clean content for comparison, while using the hash for verification.

## 2. Relocation Engine (Spiral Search)
1. **Window:** If a match fails at the target line, the engine MUST search a `+/- 100` line window.
2. **Strategy:** Search MUST expand outward (Spiral) from the target line (`+1, -1, +2, -2...`) to prioritize the intended location.
3. **Tie-breaking:** If multiple identical matches (same hash and normalized content) exist, the engine MUST select the one with the smallest absolute offset from the original target.

## 4. Sequential Mutation Logic
1. **Cumulative Drift:** The engine MUST track a per-file `drift` counter.
2. **Adjustment:** For files with multiple hunks, the target line for Hunk N MUST be adjusted by the cumulative line-count change (additions minus removals) from Hunks 1 to N-1.
3. **Search Origin:** The Spiral Search for Hunk N MUST begin at `OriginalTarget + Drift`.

## 5. Normalization & Comparison
1. **Pre-processing:** The engine MUST apply the full `normalizeForHash` pipeline (NFC, invisible char stripping, absolute whitespace stripping) to file lines before hashing or comparison.
2. **Content Match:** A match is valid ONLY if both the hash and the normalized content match the hunk's anchor.

## 6. Transactional Integrity
1. **Per-File Atomicity:** If any hunk in a file fails to relocate or verify, the entire file operation MUST be rolled back.
2. **Per-Call Granularity:** Success or failure in one file MUST NOT affect other files in the same `apply_patch` call. The tool MUST return a per-file status report.

## 7. Live Sync (Confusion Prevention)
1. **Requirement:** To prevent model confusion after edits, the tool result MUST include updated line numbers and hashes for the modified blocks.
2. **Format:** Return a summary mapping modified ranges to their new anchored state.

## 8. Failure Modes
1. **Collisions:** If a search window contains multiple equidistant matches, the engine MUST fail fast and prompt a re-read.
2. **OOB:** If an adjusted target is out of bounds, the engine MUST fail.
## 9. Hyper-Edge Case Handling
1. **Hunk-Level Atomicity (All-or-Nothing):** Relocation is only valid if EVERY anchored line (` ` and `-`) in the hunk matches the file at the new offset. Partial relocation within a hunk is strictly FORBIDDEN.
2. **Tie-Break Stalemate:** If the Spiral Search finds unique matches at exactly equidistant offsets (e.g., `+5` and `-5`), the engine MUST fail fast.
3. **Empty Line Collapsing:** To resolve "Empty Line Storms" (ambiguous `aaaa` anchors), the engine SHOULD collapse sequences of multiple empty lines into a single empty line during the mutation process.
4. **EOF Resilience:** The engine MUST be invariant to trailing newlines at the end of the file. Insertion at the end of a file MUST work regardless of whether the file ends with `\n`.
