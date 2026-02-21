# Codex: Exhaustive Understanding of Git Diff Formats and an Ideal Edit-Tool Design

## Scope

This document is a deep technical reference for:
- Git diff format families (human and machine oriented)
- exact syntax and semantics that matter during parsing/application
- failure modes and ambiguity surfaces
- a robust design for an edit tool that uses diff as a first-class patch protocol

The goal is not only to describe how diffs look, but how to build a deterministic, safe, auditable system around them.

---

## 1. Conceptual Foundation

A diff is a state transition description.

Given two snapshots `S_old` and `S_new`, a patch `P` is valid if applying `P` to `S_old` yields `S_new` under the defined semantics.

Important properties:
- **Declarative**: It states what changed, not just imperative editing steps.
- **Contextual**: Unified hunks carry surrounding lines, making application verifiable.
- **Auditable**: Patch text is reviewable and can be persisted.
- **Composable**: Multi-file patches can encode coherent changesets.
- **Partially resilient**: Context matching allows controlled adaptation to drift.

Diffs are therefore both a review artifact and an execution protocol.

---

## 2. Diff Families in Git

## 2.1 Raw format (`--raw`)

Purpose: compact machine summary of file-level changes.

General shape (conceptual):
- old mode
- new mode
- old object id
- new object id
- status code
- path(s)

Status examples:
- `A` add
- `M` modify
- `D` delete
- `R<score>` rename with similarity
- `C<score>` copy with similarity
- `T` type change
- `U` unmerged
- `X` unknown/problematic

Use cases:
- fast policy checks
- change-type counting
- preflight risk gating

Not suitable for line-level application because it lacks hunks.

## 2.2 Patch / unified format (`-p`)

This is the primary patch language for text edits.

Canonical sequence per file:
1. `diff --git a/<path> b/<path>`
2. optional extended headers
3. path markers `---` / `+++`
4. one or more hunks

Extended headers may include:
- `index <oldsha>..<newsha> <mode>`
- `old mode <mode>`
- `new mode <mode>`
- `new file mode <mode>`
- `deleted file mode <mode>`
- `rename from <path>`
- `rename to <path>`
- `copy from <path>`
- `copy to <path>`
- `similarity index <n>%`
- `dissimilarity index <n>%`

Path markers:
- `--- a/<path>` old side
- `+++ b/<path>` new side
- `/dev/null` used for creation/deletion in classic patch style

Hunk header:
- `@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ <optional section heading>`

Hunk lines:
- ` ` context line
- `-` removed line
- `+` added line
- `\ No newline at end of file` metadata marker

Unified patch is the best foundation for an edit engine.

## 2.3 Combined/merge diff (`-c`, `--cc`)

Represents change relative to multiple parents.

Characteristics:
- multiple parent ranges in headers
- changed line prefixes encode parent-wise relation
- designed mainly for merge review

Operational conclusion:
- parse for display/analysis if needed
- normalize into two-way diffs before application
- do not treat as a direct apply primitive in a single-target filesystem editor

## 2.4 Word-level diff (`--word-diff`, `--word-diff=porcelain`)

Purpose: improved readability for prose/small token edits.

Benefits:
- highlights token-level movement/change
- useful in UI previews and diagnostics

Limitations:
- not a robust canonical apply language
- token boundaries depend on regex/config

Recommended use: review overlay, never execution core.

## 2.5 Statistical and name-only variants

Examples:
- `--name-only`
- `--name-status`
- `--stat`
- `--numstat`
- `--shortstat`
- `--dirstat`

Use: planning/guardrails/reporting.

Not enough for transformation execution.

## 2.6 Binary patches (`--binary`)

Git can include binary patch payloads (literal/delta encodings).

Tool stance must be explicit:
- either implement correctly end-to-end
- or reject with precise unsupported errors

A silent skip is a correctness violation.

---

## 3. Unified Diff Grammar and Parsing Notes

A resilient parser should treat unified diff as a language with strict grammar and tolerant edge handling where required.

## 3.1 High-level grammar sketch

- PatchSet := FilePatch+
- FilePatch := DiffGitHeader ExtendedHeader* PathHeader Hunk+
- DiffGitHeader := `diff --git a/X b/Y`
- PathHeader := `--- OLD` newline `+++ NEW`
- Hunk := HunkHeader HunkLine+
- HunkHeader := `@@ -a,b +c,d @@` [section]
- HunkLine := Context | Remove | Add | NoNewlineMarker

Notes:
- counts may be omitted in some producer variants (`-n +m` forms). Support policy should be explicit.
- section header after `@@` is advisory.

## 3.2 Path parsing hazards

- spaces/tabs in path names
- quoting/escaping conventions
- rename/copy paths in extended headers
- path separators on different OS targets

Parser must avoid naive `split(' ')` logic.

## 3.3 Index line meaning

`index <old>..<new> <mode>` provides object identity hints.

In non-repo filesystem tools, object ids may be unavailable for validation.

Policy options:
- ignore ids, trust hunks
- validate ids when repository context exists
- strict mode requiring id match before apply

## 3.4 Mode and type changes

Mode examples:
- regular file `100644`
- executable `100755`
- symlink `120000`
- gitlink/submodule `160000`

An edit tool must define support per type. If symlink/submodule unsupported, it must fail immediately on encounter.

---

## 4. Hunk Application Semantics

## 4.1 Strict application

Expected location from header is treated as authoritative.

Algorithm:
1. map old range to file slice
2. verify all context/remove lines match
3. replace with transformed lines

Pros: deterministic, safest.

Cons: fragile under drift.

## 4.2 Offset search

If exact line index fails, search nearby window for full old-pattern match.

Pros: tolerates shifted blocks.

Risk: wrong nearby match in repetitive code.

## 4.3 Fuzz application

Allow dropping some context constraints.

Pros: can apply despite minor edits.

Risk: semantic misplacement increases quickly.

Recommended model:
- default `fuzz=0`
- opt-in bounded fuzz
- reject on multiple candidate matches

## 4.4 Ambiguity handling

If more than one candidate matches the old hunk signature:
- reject with `AmbiguousApplyError`
- include candidate line ranges and excerpts
- do not auto-pick unless policy explicitly allows deterministic tie-breaks

## 4.5 EOF newline semantics

No-final-newline marker impacts file bytes and POSIX behavior.

Engine must preserve requested newline state exactly.

## 4.6 CRLF/LF and normalization

Line ending strategy must be explicit:
- `bytes` mode: exact raw matching
- `logical` mode: normalize for matching, restore per write policy

Write policy examples:
- preserve original file style
- enforce LF
- enforce CRLF

Default should be consistent and documented.

---

## 5. File Operation Semantics

## 5.1 Add

Rules:
- old side must be absent (`/dev/null` or equivalent semantics)
- new content built from added lines in hunks
- parent directories may need creation per policy

## 5.2 Delete

Rules:
- source file must exist unless idempotence mode allows already-deleted
- old hunks must match source content
- target removal happens after validation phase

## 5.3 Modify

Classic hunk apply against existing file.

## 5.4 Rename

Two variants appear in real diffs:
- pure metadata rename with no hunks
- rename plus content edits

Safe execution order:
1. validate source existence
2. validate destination policy
3. stage rename in plan
4. apply hunks to target representation

## 5.5 Copy

Requires reading source while preserving original.

Copy plus edits behaves like clone then patch.

## 5.6 Mode changes

Must support at least executable bit if claiming practical Git compatibility.

If platform lacks some mode semantics, tool should degrade explicitly with clear constraints.

## 5.7 Symlink/Submodule

If unsupported:
- fail at parse/plan phase with feature-specific message
- include file paths and header line context

---

## 6. Binary Patch Considerations

Binary patch support is materially different from text hunks.

If implemented:
- parse binary blocks accurately
- validate target blob identity when possible
- decode and write exact bytes
- preserve mode/type semantics

If not implemented:
- reject before any write
- provide supported alternatives (e.g., instruct to use VCS-native apply)

---

## 7. Error Taxonomy for a Serious Edit Tool

Typed errors are required for autonomous repair loops.

Recommended categories:
- `PatchParseError`
- `PatchValidationError`
- `UnsupportedFeatureError`
- `PathPolicyError`
- `FileNotFoundError`
- `FileTypeError`
- `ContextMismatchError`
- `AmbiguousApplyError`
- `TransactionError`
- `BinaryApplyError`

Each error payload should include:
- patch file index
- hunk index (if applicable)
- path(s)
- expected vs actual snippets
- line ranges
- remediation hints

---

## 8. Transaction Model

A reliable tool should be transactional.

## 8.1 Two-phase approach

Phase A: **preflight**
- parse
- validate feature support
- validate path policy
- match all hunks in memory
- resolve all rename/copy/delete operations

Phase B: **commit**
- apply writes from staged results
- apply mode changes
- finalize deletions/renames atomically where possible

## 8.2 Atomicity options

- true atomic commit via temp files + rename
- journaled rollback on failure

Never leave silent partial state.

## 8.3 Concurrency safeguards

Optional optimistic concurrency controls:
- check file mtime/inode snapshot before commit
- repository index/hash checks if available

On mismatch, abort with conflict classification.

---

## 9. Idempotence and Re-entrancy

Automation often retries.

Tool should classify hunk outcomes:
- `applied`
- `already_applied`
- `rejected`

`already_applied` detection strategy:
- test whether post-state pattern already exists where old-state does not
- ensure no false positive via bounded structural checks

This enables robust reruns without brittle failures.

---

## 10. Security and Policy Boundaries

Mandatory controls:
- path sandbox (no traversal outside workspace)
- forbidden globs
- max changed files/lines thresholds
- optional denylist for binary/type changes
- optional require-clean-state precondition

Path validation must canonicalize before checks.

---

## 11. Observability Without Noisy Logging

Given strict environments, prefer structured result objects over ad-hoc logs.

Return fields should include:
- counts (files/hunks/additions/deletions)
- per-file operation summaries
- timings per phase
- deterministic error codes

This supports CI and agentic loops without runtime log spam.

---

## 12. Designing the Ideal Diff-Centric Edit Tool

## 12.1 Interface

Input:
- `patch: string`
- `options`
  - `dryRun: boolean`
  - `strict: boolean`
  - `offsetWindow: number`
  - `fuzz: number`
  - `allowRename: boolean`
  - `allowCopy: boolean`
  - `allowMode: boolean`
  - `allowBinary: boolean`
  - `lineEnding: 'preserve'|'lf'|'crlf'`
  - `sandboxRoot: string`
  - `maxFiles: number`
  - `maxChangedLines: number`

Output:
- `ok: boolean`
- `phase: 'parse'|'validate'|'preflight'|'commit'`
- `summary`
  - `files`
  - `hunks`
  - `additions`
  - `deletions`
  - `alreadyApplied`
- `results[]` per file/hunk
- `errors[]` typed diagnostics

## 12.2 Internal architecture

Modules:
1. `lexer` (line scanner)
2. `parser` (AST builder)
3. `normalizer` (canonical model)
4. `planner` (operations DAG)
5. `matcher` (hunk anchoring engine)
6. `executor` (in-memory transforms)
7. `writer` (transactional persistence)
8. `reporter` (structured diagnostics)

This separation keeps complexity manageable.

## 12.3 Matching engine design

Matching should be deterministic and scored.

Candidate score dimensions:
- exact context coverage
- positional distance from expected line
- uniqueness of match

Selection rules:
- choose only if top candidate is unique and above threshold
- otherwise reject as ambiguous

## 12.4 Reject artifact strategy

When not applied, return machine-readable reject objects equivalent to `.rej` intent:
- original hunk text
- failure reason
- nearest candidates
- suggested flags (`offsetWindow`, `fuzz`) when safe

## 12.5 Preview mode

A preview should output:
- normalized patch
- impacted files
- final per-file synthetic hunks after relocation
- risk score (ambiguity, drift, fuzzy use)

Useful for human approval flows.

---

## 13. How I Would Use Different Diff Formats in the Tool

- **Unified patch (`-p`)**: single execution source of truth.
- **Raw diff (`--raw`)**: fast metadata precheck and change classification.
- **Name/stat formats**: policy gate and budget enforcement before parsing heavy patch content.
- **Word diff**: optional visualization in UI and diagnostics only.
- **Combined diff**: accepted only if normalized to two-way patch first.
- **Binary blocks**: explicit feature flag; hard fail if disabled.

This division keeps execution semantics clear while preserving useful views.

---

## 14. Edge Cases That Must Be Handled Explicitly

- empty files and zero-length hunks
- hunks touching first/last lines
- repeated identical context blocks
- file with mixed line endings
- no newline at EOF transitions
- rename to existing path collisions
- path case-sensitivity differences across platforms
- very large files/hunks (memory controls)
- non-UTF-8 bytes in text files
- partial patch where headers and hunks disagree

Each edge case should map to deterministic behavior, not best-effort guesswork.

---

## 15. Performance Model

For large patches:
- stream parse line-by-line
- avoid full-string duplication
- lazily load target files only when needed
- batch filesystem writes in commit phase
- cap candidate-search windows for matcher

Complexity drivers:
- number of hunks
- search window size
- repetitiveness of target content

Predictable limits should be configurable.

---

## 16. AI-Generated Patch Loop (Ideal)

For autonomous coding agents:
1. agent emits unified diff
2. tool runs strict dry-run
3. tool returns structured errors/candidates
4. agent repairs patch
5. tool re-validates and commits atomically

Why this works:
- closes ambiguity with deterministic feedback
- avoids brittle string replacement APIs
- creates auditable edit history

---

## 17. Practical Compliance Matrix

A high-quality edit tool centered on git diff should satisfy:

Required:
- parse standard unified diffs (multi-file)
- apply add/modify/delete text hunks
- strict dry-run support
- transactional commit or rollback
- typed diagnostics with file/hunk context
- explicit path sandbox enforcement

Strongly recommended:
- rename/copy semantics
- executable bit mode changes
- newline/line-ending control
- already-applied detection
- ambiguity detection and rejection

Optional advanced:
- binary patch application
- symlink/submodule handling
- repository-object-id validation

---

## 18. Final Position

Git unified diff is the best general-purpose edit protocol for text codebases because it combines readability, context-verifiable application, and portability.

If designing an edit tool from scratch, I would:
- make unified diff the canonical input language
- implement strict parser + typed errors
- run full preflight before any write
- apply changes transactionally
- expose controlled relocation/fuzz policies
- provide machine-grade diagnostics for automated repair

That design yields correctness, safety, and excellent ergonomics for both humans and AI agents.