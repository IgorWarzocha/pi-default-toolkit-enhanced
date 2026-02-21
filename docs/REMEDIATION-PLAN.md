# Apply Patch Remediation Plan

## Problem Statement

Agents produce patches with incorrect whitespace/indentation. The healing
engine has the right ideas but the pieces are disconnected: repair helpers
exist as dead code, the matching layers use three incompatible whitespace
semantics, a legacy parser greedily destroys content, and the prompt doesn't
explain the prefix-vs-indent contract.

### Goals

1. **Preserve** all multi-file operation capability (Create / Edit / Delete / Move / Edit+Move).
2. **Preserve** `***` / `###` envelope markers and `(Operation) File:` with or without `File`.
3. **Fix** whitespace and indentation handling end-to-end.

---

## Phase 0 — Dead Code Removal

Remove unreachable functions from `healing.ts`. Keep reusable primitives.

### Remove entirely

| Function | Reason |
|---|---|
| `restoreOldWrappedLines` | No callers. Speculative line-unwrap heuristic. |
| `stripRangeBoundaryEcho` | No callers. Was for range-replace echo stripping. |
| `maybeExpandSingleLineMerge` | No callers. Continuation-line merge detection. |
| `stripTrailingContinuationTokens` | Only caller was `maybeExpandSingleLineMerge`. |
| `stripMergeOperatorChars` | Only caller was `maybeExpandSingleLineMerge`. |
| `normalizeConfusableHyphensInLines` | No callers. Batch wrapper around scalar version. |
| `healChunkOverlaps` | No callers. Depends on anchor line numbers (Phase 1 removes the source). |

### Keep (reusable in later phases)

| Function | Reused by |
|---|---|
| `leadingWhitespace` | Phase 2 — indent repair |
| `restoreLeadingIndent` | Phase 2 — indent repair |
| `restoreIndentForPairedReplacement` | Phase 2 — indent repair |
| `restoreIndentFromFirst` | Phase 2 — indent repair |
| `normalizeConfusableHyphens` | Phase 3 — parser prefix normalization |
| `CONFUSABLE_HYPHENS_RE` | Phase 3 — used by `normalizeConfusableHyphens` |
| `stripAllWhitespace` | Phase 2 — file-aware content comparison |
| `equalsIgnoringWhitespace` | Phase 2 replaces its callers, then remove |

### Files changed

- `src/apply/healing.ts` — delete 7 functions (~120 lines)

### Verification

- All existing tests MUST still pass (they don't test any removed function).
- `grep -rn` for each removed function name MUST return zero hits outside
  test files and this document.

---

## Phase 1 — Remove `parseAnchoredBody` (Legacy Anchor Parsing)

### Problem

`parseAnchoredBody` matches `/^\s*(\d+)\s*[:|]\s?(.*)$/` on every context
(`' '`) and removal (`'-'`) line. This greedily interprets real code as
anchor metadata:

```
 case 1: return "foo"
    → anchor line 1, content: `return "foo"`   ← DESTROYS the actual line
```

The function was intended for a `N: content` / `N|content` format that was
deprecated in commit `0a28a51`. The remaining anchor infrastructure
(`getRange`, seed computation, `mismatch` error display) works correctly
when anchors come solely from the `@@ -N,M +N,M @@` hunk header — which
is the only reliable source.

### Changes

**`src/apply/parser.ts`:**

1. Delete the `parseAnchoredBody` function.
2. In `parseEditFileChunk`, where context (`' '`) and removal (`'-'`)
   lines are parsed, replace:
   ```ts
   const anchored = parseAnchoredBody(line.slice(1));
   chunk.oldLines.push(anchored.line);
   chunk.oldAnchors.push({ line: anchored.lineNumber, offset: ... });
   ```
   with:
   ```ts
   chunk.oldLines.push(line.slice(1));
   chunk.oldAnchors.push({ line: 0, offset: ... });
   ```
3. The existing `oldStart` block at the end of `parseEditFileChunk`
   populates anchors from `@@ -N,M` headers. This continues to work
   unchanged — it fills `line: 0` entries with computed positions.

**`src/apply/types.ts`:**

- `EditLineAnchor.offset` becomes vestigial (only used by removed
  `healChunkOverlaps`). Keep the field to avoid a multi-file type change.
  Add a comment marking it vestigial.

### Why this is safe

- `getRange` checks `oldAnchors[0].line` and `oldAnchors[last].line`.
  Without `parseAnchoredBody`, these are 0 unless set by `@@ -N` header.
  `getRange` returns `null` when `line < 1`, so range mode only activates
  with explicit hunk headers. Correct.
- `locate` in `index.ts` checks `firstAnchor.line > 0` for seed
  selection. Falls back to `0` when no anchor. Correct.
- `mismatch` in `index.ts` skips anchors with `line <= 0`. Falls back to
  content-based search. Correct.

### Files changed

- `src/apply/parser.ts` — delete function, simplify 2 call sites

### Verification

- All existing parser tests MUST pass.
- The "captures anchor offsets from prefixed edit lines" test in
  `parser.test.ts` tests `parseAnchoredBody` behavior and MUST be updated
  or removed.
- Manual test: a patch containing `case 1: return "foo"` as a context
  line MUST NOT corrupt the content.

---

## Phase 2 — Fix Whitespace Semantics (Solutions A + B)

### Sub-phase 2a: Unify matching semantics

Three whitespace comparison functions exist with different semantics.
Standardise on two: **exact** and **normalised indent**.

| Function | Current semantics | Target |
|---|---|---|
| `===` | Byte-identical | Keep as-is (exact match) |
| `normalizeIndent` (index.ts) | tabs→4sp, multi-space→1sp, trimEnd | Promote to shared, use as fuzz |
| `equalsIgnoringWhitespace` (healing.ts) | Strip ALL whitespace | **Replace with normalizeIndent** |

**Changes:**

1. Move `normalizeIndent` from `index.ts` (private) to
   `src/shared/normalize.ts` (exported).
2. In `healing.ts`, replace `equalsIgnoringWhitespace` usages:
   - `matchesAt` — used by `detectAlreadyApplied` and `hasOldMatch`:
     ```ts
     // Before
     if (!equalsIgnoringWhitespace(lines[start + index], block[index])) return false;
     // After
     if (normalizeIndent(lines[start + index]) !== normalizeIndent(block[index])) return false;
     ```
   - `getRange` boundary check in `computeReplacementsWithHealing`:
     ```ts
     // Before
     if (!equalsIgnoringWhitespace(firstActual, firstExpected) || ...)
     // After
     if (normalizeIndent(firstActual) !== normalizeIndent(firstExpected) || ...)
     ```
3. Delete `equalsIgnoringWhitespace` from `healing.ts` (no remaining callers
   after Phase 0 removed `stripRangeBoundaryEcho`).

### Sub-phase 2b: Wire indent repair on fuzz matches (Solution A)

When a chunk is located via fuzz matching (`fuzzUsed > 0`), the old-lines
in the patch have drifted indentation (usually the prefix-stealing
problem). The replacement `newLines` carry this drift. Fix by restoring
the file's ground-truth indentation.

**Where:** `computeReplacementsWithHealing` in `healing.ts`, after a
successful `locate`, before pushing the replacement.

**Logic:**

```ts
const start = locate.start;
const origLines = originalLines.slice(start, start + chunk.oldLines.length);
let newLines = [...chunk.newLines];

if (locate.fuzzUsed > 0) {
  // Context lines: use exact file content (they shouldn't change)
  for (let i = 0; i < newLines.length; i++) {
    if (i < chunk.oldLines.length
        && stripAllWhitespace(chunk.oldLines[i]) === stripAllWhitespace(newLines[i])) {
      // This is a context line — replace with file's exact content
      newLines[i] = origLines[i];
      continue;
    }
  }
  // Non-context lines: attempt paired indent restoration
  newLines = restoreIndentForPairedReplacement(origLines, newLines);
  // Fallback: inherit indent from first matched line
  if (newLines === chunk.newLines) {
    newLines = restoreIndentFromFirst(origLines, [...chunk.newLines]);
  }
}
```

**Key safety property:** Context lines (same content in old and new) are
always replaced with the file's exact bytes. Only genuinely changed lines
go through indent heuristics, which only fire when the new line has zero
leading whitespace (likely stripped by the prefix problem).

### Sub-phase 2c: File-aware pre-apply indent repair (Solution B)

After the file content is read but before `computeReplacementsWithHealing`
runs, silently repair old-lines in each chunk by comparing against the
actual file. This fixes the stolen-space problem at source before the
matching engine even runs.

**Where:** New function `repairChunkIndent` called from
`deriveUpdatedContentWithHealing` in `index.ts`, after splitting
`originalContent` into lines.

**Logic:**

```ts
function repairChunkIndent(
  fileLines: string[],
  chunks: EditFileChunk[],
): void {
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.oldLines.length; i++) {
      const patchLine = chunk.oldLines[i];
      const patchStripped = stripAllWhitespace(patchLine);
      if (patchStripped.length === 0) continue;

      // Try the anchor position first (from @@ -N header)
      const anchor = chunk.oldAnchors[i];
      if (anchor && anchor.line > 0 && anchor.line <= fileLines.length) {
        const fileLine = fileLines[anchor.line - 1];
        if (stripAllWhitespace(fileLine) === patchStripped) {
          chunk.oldLines[i] = fileLine;
          // Fix corresponding context line in newLines
          if (i < chunk.newLines.length
              && stripAllWhitespace(chunk.newLines[i]) === patchStripped) {
            chunk.newLines[i] = fileLine;
          }
          continue;
        }
      }

      // Scan nearby (small window) for a unique content match
      const seed = anchor && anchor.line > 0 ? anchor.line - 1 : 0;
      const scanStart = Math.max(0, seed - 20);
      const scanEnd = Math.min(fileLines.length, seed + 20);
      let matchIdx = -1;
      let matchCount = 0;
      for (let j = scanStart; j < scanEnd; j++) {
        if (stripAllWhitespace(fileLines[j]) === patchStripped) {
          matchIdx = j;
          matchCount++;
        }
      }
      if (matchCount === 1) {
        chunk.oldLines[i] = fileLines[matchIdx];
        if (i < chunk.newLines.length
            && stripAllWhitespace(chunk.newLines[i]) === patchStripped) {
          chunk.newLines[i] = fileLines[matchIdx];
        }
      }
    }
  }
}
```

**Performance:** Zero additional I/O — the file is already read on the
line immediately before. The scan is bounded (±20 lines per old-line).
For a typical 5-line chunk this is ~200 comparisons.

**Silence:** This function MUST NOT produce any output, log messages, or
model-visible feedback. It is a transparent fixup.

### Files changed

- `src/shared/normalize.ts` — add exported `normalizeIndent`
- `src/apply/healing.ts` — replace `equalsIgnoringWhitespace` usages,
  delete the function, wire indent repair in `computeReplacementsWithHealing`
- `src/apply/index.ts` — add `repairChunkIndent`, call from
  `deriveUpdatedContentWithHealing`, remove private `normalizeIndent`
  (now imported from shared)

### Verification

- All existing tests MUST pass.
- New test: patch with systematically off-by-one indent (prefix stealing)
  MUST apply correctly and produce file with original indentation.
- New test: patch with intentional re-indent (moving code into a block)
  MUST NOT have its indentation reverted.
- New test: already-applied detection MUST NOT false-positive on lines
  that differ only in meaningful whitespace.

---

## Phase 3 — Confusable Hyphen Normalization in Parser (Solution D)

### Problem

If a model emits `\u2013` (en-dash) or `\u2212` (minus sign) as a removal
prefix, the parser doesn't recognise it as `'-'`, falls through to the
invalid-line error. `normalizeConfusableHyphens` exists in `healing.ts`
but is never called.

### Changes

**`src/apply/parser.ts`**, in `parseEditFileChunk`, before the prefix
check:

```ts
// Normalize confusable hyphens in prefix position only
const effectiveLine = line.length > 0 && CONFUSABLE_HYPHENS_RE.test(line[0])
  ? "-" + line.slice(1)
  : line;
const prefix = effectiveLine[0];
```

Import `CONFUSABLE_HYPHENS_RE` from `healing.ts` (already exported).

This normalises only the first character. The content after the prefix is
left untouched — no risk of corrupting file content that legitimately
contains Unicode dashes.

### Files changed

- `src/apply/parser.ts` — import constant, 3-line change in
  `parseEditFileChunk`

### Verification

- New test: patch with `\u2013` prefix on a removal line MUST parse
  correctly and apply the removal.

---

## Phase 4 — Prompt Improvements (Solution C)

### Problem

The current prompt instructions in `APPLY_PATCH_PROMPT_INSTRUCTIONS`
(`constants.ts`) describe the prefix rules in a terse bullet list that
doesn't clarify the prefix-vs-indent contract. Models don't understand
that the space prefix is *in addition to* the line's existing indentation.

### Changes

Replace the "Edit Hunks" section in `APPLY_PATCH_PROMPT_INSTRUCTIONS`
with explicit rules and a worked example:

```
### Edit Hunks
Each edit hunk MUST start with @@. The text after @@ is a positioning
hint — the tool searches for this text in the file to locate the edit.

Every body line MUST begin with exactly one prefix character, followed
by the COMPLETE original line content INCLUDING its indentation:

  ' ' + <original line>  → context (unchanged)
  '-' + <original line>  → removal
  '+' + <new line>        → addition

IMPORTANT: The single-character prefix is PREPENDED to the line as it
appears in the file. Do NOT strip or alter the line's leading whitespace.

Example — if the file contains (4-space indent):
    return x;

Then in the patch:
  CORRECT:  ' ' + '    return x;'  →  '     return x;'   (5 chars of leading space)
  WRONG:    '    return x;'         (missing prefix — parser rejects)
  WRONG:    ' return x;'            (prefix ate the indent — 3 spaces instead of 4)

Additional rules:
- Insertion-only hunks (only '+' lines) MUST include @@ context.
- Unprefixed lines after @@ are accepted as additions (lenient mode).
- Use '+' alone (no content) for blank lines in Create File blocks.
```

### Files changed

- `src/apply/constants.ts` — rewrite the Edit Hunks section of
  `APPLY_PATCH_PROMPT_INSTRUCTIONS`

### Verification

- Manual review of rendered prompt for clarity.
- No code-level test needed (prompt text only).

---

## Execution Order

```
Phase 0  →  Phase 1  →  Phase 2a  →  Phase 2b  →  Phase 2c  →  Phase 3  →  Phase 4
  │            │           │            │            │            │            │
  │            │           │            │            │            │            └─ prompt only
  │            │           │            │            │            └─ parser + import
  │            │           │            │            └─ index.ts (new function)
  │            │           │            └─ healing.ts (wire existing helpers)
  │            │           └─ normalize.ts + healing.ts + index.ts
  │            └─ parser.ts (remove parseAnchoredBody)
  └─ healing.ts (delete dead functions)
```

Each phase is independently testable. Run the full test suite after each.

## Risk Summary

| Phase | Risk | Reason |
|---|---|---|
| 0 | None | Removing unreachable code |
| 1 | Low | Parser simplification; anchor fallback paths already handle `line: 0` |
| 2a | Low | Tightens matching (rejects `constx ≈ const x` false positives) |
| 2b | Low | Only activates on fuzz matches; context lines get file's exact bytes |
| 2c | Low | Silent pre-repair; bounded scan; only fixes when content-equal |
| 3 | None | Single-char prefix normalization; content untouched |
| 4 | None | Prompt text only |

## What Is NOT Changed

- Patch envelope format (`*** Begin Patch` / `*** End Patch`)
- `***` / `###` marker support with optional trailing markers
- `Create File` / `Edit File` / `Delete File` / `Move File` headers
  (with or without `File`)
- `Move to:` syntax and inline `->` move syntax
- Multi-file batching in one envelope
- Transaction semantics and rollback
- `*** End of File` marker
- `@@ context` search and `@@ -N,M +N,M @@` hunk header parsing
- Guard (one `apply_patch` per turn, `edit`/`write` disabled)
- Heredoc stripping (defensive parser recovery, harmless)
- Parse error enrichment (`parse-recovery.ts`)
- Render layer (`render.ts`)
