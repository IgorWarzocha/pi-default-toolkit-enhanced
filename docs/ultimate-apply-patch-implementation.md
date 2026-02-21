# Ultimate Apply Patch Implementation

## Goal

Design a foolproof `apply_patch` engine that reflects universal agreement across the model analyses while preserving current capability for:

- create
- edit (modify)
- move (rename)
- delete

The engine MUST be diff-native, deterministic, auditable, and safe for autonomous retry loops.

---

## Universal Consensus (Cross-Model)

All models consistently converge on these points:

1. Unified diff MUST be the canonical patch protocol.
2. Hunk context MUST be the primary anchor for application.
3. Patch application MUST be atomic (all-or-nothing).
4. The engine MUST fail fast with explicit diagnostics (no silent skips).
5. Ambiguous matches MUST be rejected unless policy explicitly allows tie-breaking.
6. A dry-run mode SHOULD be first-class.
7. Idempotent retry behavior SHOULD classify `already_applied` explicitly.
8. Create/edit/move/delete MUST be represented and applied via patch semantics.

---

## Supported Patch Surface

### Required

- Multi-file unified diff (`diff --git`, `---`, `+++`, `@@ ... @@`)
- Line operations (` `, `-`, `+`)
- File operations:
  - create (`--- /dev/null` -> `+++ b/path`)
  - edit (`--- a/path` -> `+++ b/path` with hunks)
  - move (`rename from` / `rename to`, optionally with hunks)
  - delete (`--- a/path` -> `+++ /dev/null`)

### Optional (Feature-Flagged)

- copy (`copy from` / `copy to`)
- mode changes (`old mode` / `new mode`)
- binary patches (`GIT binary patch`)

If optional features are disabled, the engine MUST reject them during preflight.

---

## Deterministic Processing Pipeline

## Phase 1: Parse + Normalize

The engine MUST:

1. Parse file headers, extended headers, and hunks strictly.
2. Preserve line payload bytes and EOF-newline markers.
3. Normalize only for matching if configured (not for lossy rewrite).
4. Canonicalize and validate paths against workspace sandbox.

Output: typed Patch AST.

## Phase 2: Preflight Plan (No Writes)

The engine MUST:

1. Validate feature support (rename, mode, binary, etc.).
2. Build an operation plan for each file (`create|edit|move|delete`).
3. Resolve hunk anchors in memory.
4. Detect ambiguity and overlap conflicts.
5. Compute full post-state for all touched files.

Preflight MUST produce either:

- complete, conflict-free execution plan, or
- structured errors and no filesystem mutation.

## Phase 3: Atomic Commit

The engine MUST:

1. Write staged outputs via temp files.
2. Apply moves/deletes in a safe order.
3. Finalize with atomic rename/replace where possible.
4. Roll back everything on any commit failure.

No partial success MAY be persisted in strict mode.

---

## Hunk Matching Rules

### 1) Exact First

Try header-indicated location first with full context equality.

### 2) Bounded Relocation

If exact fails, scan within bounded window around expected location.

### 3) Global Scan (Optional)

If window fails and policy allows, scan entire file for full-context match.

### 4) Fuzz (Optional)

Context relaxation MAY be allowed, but:

- default MUST be `fuzz=0`
- fuzz MUST be bounded
- fuzzed application MUST be reported

### 5) Ambiguity Handling

If multiple candidates score equally valid, engine MUST return `AmbiguousApplyError` and MUST NOT auto-pick.

---

## File Operation Semantics

## Create

A create operation MUST:

- require old side as null/absent
- materialize new content from hunk additions
- create parent directories only within sandbox policy

## Edit

An edit operation MUST:

- verify all required context/deletion lines against source
- apply hunks in order with line-shift tracking

## Move

A move operation MUST:

- validate source existence
- validate destination policy and collision rules
- preserve content for pure rename
- apply content hunks if present after relocation planning

## Delete

A delete operation MUST:

- verify source (or classify as already-deleted in idempotent mode)
- remove file only after full preflight success

---

## Idempotence and Retry

Each hunk/file outcome SHOULD be classified as:

- `applied`
- `already_applied`
- `rejected`

`already_applied` detection MUST avoid false positives by checking both:

1. old pattern not present where expected, and
2. new pattern already present with consistent structure.

This enables safe autonomous re-runs.

---

## Error Taxonomy (Typed)

Minimum required error types:

- `PatchParseError`
- `UnsupportedFeatureError`
- `PathPolicyError`
- `FileNotFoundError`
- `ContextMismatchError`
- `AmbiguousApplyError`
- `OverlapConflictError`
- `TransactionError`

Each error MUST include:

- file path
- hunk index (if applicable)
- expected vs actual excerpt
- candidate locations when ambiguous
- actionable remediation hint

---

## Safety and Policy

The engine MUST enforce:

- sandboxed paths (no traversal outside root)
- deterministic operation order
- configurable max files / max changed lines budget
- explicit handling for unsupported file types/features

The engine SHOULD expose policy flags for:

- strict vs permissive mode
- rename/copy/mode/binary allowances
- line-ending write policy (`preserve|lf|crlf`)

---

## Output Contract

The API SHOULD return structured data, not log text:

```ts
{
  ok: boolean,
  phase: "parse" | "preflight" | "commit",
  summary: {
    files: number,
    hunks: number,
    additions: number,
    deletions: number,
    alreadyApplied: number
  },
  files: [
    {
      pathOld: string,
      pathNew: string,
      operation: "create" | "edit" | "move" | "delete",
      status: "applied" | "already_applied" | "rejected",
      hunks: [
        {
          index: number,
          status: "applied" | "already_applied" | "rejected",
          relocatedBy: number,
          fuzzUsed: number
        }
      ]
    }
  ],
  errors: []
}
```

---

## Default Behavior Recommendation

Defaults SHOULD optimize correctness:

- `dryRun = false`
- `strict = true`
- `offsetWindow = 64`
- `fuzz = 0`
- `allowMove = true`
- `allowCreate = true`
- `allowEdit = true`
- `allowDelete = true`
- `allowCopy = false`
- `allowMode = false`
- `allowBinary = false`
- `lineEnding = "preserve"`

---

## G3Pro Two-Layer Interface Option

G3Pro introduces a complementary interface strategy that MAY be added without changing core patch correctness.

Principle:

- Unified diff MUST remain the canonical execution artifact.
- The AI-facing authoring format SHOULD be semantic Search/Replace Blocks (SRBs).
- A deterministic local compiler MUST transform SRBs into strict unified diffs before preflight/commit.

### SRB Shape (AI-Facing)

```text
<<<< SEARCH [path]
<exact or near-exact context block>
==== REPLACE
<replacement block>
>>>>
```

### Compiler Responsibilities

The SRB compiler MUST:

1. Locate unique search anchors using deterministic matching.
2. Reject ambiguous anchors with candidate locations.
3. Optionally use bounded fuzzy distance for minor drift.
4. Recompute exact hunk headers and line counts.
5. Emit valid multi-file unified diff for the core engine.

The compiler SHOULD:

- auto-normalize indentation/line endings according to project policy,
- request additional context when search blocks are under-specified,
- split oversized replacements into smaller hunks when safe.

### Why This Helps

This mode reduces AI failure on line-number math while preserving:

- strict patch auditability,
- transactional semantics,
- standard review workflows (`git diff`, staged review),
- full create/edit/move/delete support after compile.

### Integration Contract

When enabled, processing becomes:

1. `AI -> SRB`
2. `SRB Compiler -> Unified Diff`
3. `Core Engine -> Parse/Preflight/Commit`

If SRB compilation fails, commit MUST NOT start.

---

## Practical Definition of "More Foolproof"

A patch engine is "more foolproof" when it:

1. never performs silent best-effort writes,
2. never leaves partial filesystem state,
3. always explains precisely why a patch did not apply,
4. supports safe retries without duplicate corruption,
5. handles create/edit/move/delete as first-class transactional ops.

This specification is the converged, implementation-ready baseline from the model set.