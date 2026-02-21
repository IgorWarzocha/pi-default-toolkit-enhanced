# Git Diff Formats: Comprehensive Understanding

## 1. Unified Diff Format

The most common and human-readable diff format.

### Structure

```
--- a/original/file.txt
+++ b/modified/file.txt
@@ -start,count +start,count @@ [optional context]
 [content lines]
```

### Key Characteristics

- **Header**: Two lines showing original (\`---\`) and modified (\`+++\`) files
- **Hunk headers**: \`@@ -n,m +n,m @@\` where:
  - \`-n,m\` = starting line and count in original file
  - \`+n,m\` = starting line and count in modified file
- **Context lines**: Unchanged lines (prefixed with space)
- **Additions**: Lines starting with \`+\` (green)
- **Deletions**: Lines starting with \`-\` (red)

### Example

\`\`\`diff
--- a/src/utils.js
+++ b/src/utils.js
@@ -1,5 +1,6 @@
 function add(a, b) {
-  return a + b;
+  if (typeof a !== 'number' || typeof b !== 'number') {
+    throw new Error('Both arguments must be numbers');
+  }
+  return a + b;
 }
\`\`\`

## 2. Context Diff Format

Older format using \`.\` for unchanged, \`<\` for deletions, \`>\` for additions.

\`\`\`diff
*** file1.txt
--- file1.txt
***************
*** 1,5 ****
  line 1
  line 2
! original line 3
  line 4
  line 5
--- 1,6 ----
  line 1
  line 2
! new line 3
  line 4
  line 5
  line 6
\`\`\`

## 3. Side-by-Side Diff

Presents changes in two columns for visual comparison.

\`\`\`
file.txt                    file.txt
1. Hello World        |    1. Hello Universe
2. Line 2         <         2. Line 2
                      >    3. New line
\`\`\`

## 4. Git Binary Diff

For binary files, git shows:
- \`Binary files a/foo.png and b/foo.png differ\` for changes
- \`GIT binary patch\` with delta for patches

## 5. Raw Diff Format

Internal git format showing object hashes:
\`\`\`
:100644 100644 ... 0000000...  ABC1234...  file.txt
\`\`\`
Rarely used directly by humans.

## 6. Diff-Statistic Format

Summary showing file changes:
\`\`\`
 src/utils.js   | 10 ++++++---
 src/main.js    |  5 ++---
 2 files changed, 10 insertions(+), 7 deletions(-)
\`\`\`

## 7. Name-Only and Name-Status

\`\`\`
git diff --name-only    # Just filenames
git diff --name-status  # Filenames with status (A/M/D)
\`\`\`

## 8. Word Diff

Character-level changes within lines:
\`\`\`diff
Hello World
{+Hello Universe-}
\`\`\`

## 9. JSON Diff (git diff --json)

Structured output for programmatic use:
\`\`\`json
{
  "oldName": "file.txt",
  "newName": "file.txt",
  "oldMode": "100644",
  "newMode": "100644",
  "hunks": [...]
}
\`\`\`

# How I Would Design an Edit Tool Around Git Diff Formats

## Core Philosophy

Treat diffs as the **source of truth** for transformations, not just a comparison output.

## 1. Diff-as-Patch Architecture

### Input: Text or Diff
- Accept either raw text or pre-existing diffs
- Parse diff to extract semantic changes

### Processing
- Parse hunk headers to understand line mapping
- Build a change graph showing dependencies
- Handle overlapping hunks intelligently

### Output
- Generate valid, applyable patches
- Support reverse transformation (undo)

## 2. Hunk-Aware Editing

### Why This Matters
Traditional editors operate on line numbers, which shift as edits occur. Using diff format allows:

- **Relative positioning**: Changes are anchored to context lines
- **Mergeability**: Diffs compose cleanly
- **Conflict detection**: Overlapping changes are visible

### Implementation
\`\`\`
Original:
  1: function foo() {
  2:   return 42;
  3: }

Edit (want to change return value):
  -   return 42;
  +   return calculate();

Diff:
  @@ -2 +2 @@
  -  return 42;
  +  return calculate();

This diff can be applied safely even if line 1 changes
\`\`\`

## 3. Multi-File Transaction System

### Design
- Group related diffs into a "transaction"
- Apply atomically (all-or-nothing)
- Store inverse diffs for rollback

### Use Case
Refactoring across multiple files:
\`\`\`typescript
interface DiffTransaction {
  id: string;
  diffs: Diff[];
  inverseDiffs: Diff[]; // For undo
  apply(): Promise<Result>;
  rollback(): Promise<Result>;
}
\`\`\`

## 4. Semantic Hunk Merging

### Problem
Adjacent hunks with small gaps should merge:
\`\`\`
@@ -1,3 +1,4 @@
+A
 B
@@ -5,7 +6,8 @@
+C
\`\`\`

Should become:
\`\`\`
@@ -1,5 +1,6 @@
+A
 B
+C
\`\`\`

### Solution
- Gap threshold (e.g., 3 lines)
- Recompute hunk headers after merge
- Preserve context continuity

## 5. Reverse Diff Generation

### Algorithm
For any diff:
\`\`\`
Original:  "foo"
Diff:      "+bar -foo"
Reverse:   "+foo -bar"
\`\`\`

This enables:
- Undo/redo
- Preview before applying
- Revert selection

## 6. Interactive Diff Application

### UI Concept
- Show diff as editable view
- Allow checking/unchecking individual changes
- Preview result in real-time
- Batch apply or discard

\`\`\`
[✓] @@ -1,3 +1,4 @@
[✓] +new line
[ ] -old line to remove
[✓] @@ -10,2 +11,3 @@
[✓] +another addition
\`\`\`

## 7. Diff-Based Search and Replace

### Multi-File Operations
\`\`\`
Search: "deprecatedFunction"
Replace: "newFunction"
Options: [x] Regex [ ] Case sensitive [x] Preview

Generates diffs for ALL files containing the pattern
\`\`\`

### Conflict Detection
- If file has local changes, warn before overwriting
- Show three-way merge preview

## 8. Structural Diff Modes

### For Code
- Parse as AST, not text
- Show refactoring-level changes ("moved function", "renamed parameter")
- Ignore whitespace/formatting noise

### For Data (JSON/YAML)
- Tree-structured diff
- Show additions, removals, modifications at key level

## 9. Patch Format Extensions

### Custom Metadata
\`\`\`diff
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
+// TODO: This change was AI-generated
 // Type: enhancement
+// Confidence: 0.95
 // Tags: [refactor, performance]
\`\`\`

### Tracking
- Store author, timestamp, purpose
- Link to issue/ticket
- Version diff history

## 10. API Design Sketch

\`\`\`typescript
interface DiffEngine {
  // Create diff from texts
  diff(oldText: string, newText: string): Diff;

  // Apply diff to text
  apply(text: string, diff: Diff): string;

  // Reverse diff
  reverse(diff: Diff): Diff;

  // Compose diffs (apply b to result of applying a)
  compose(a: Diff, b: Diff): Diff;

  // Merge overlapping diffs
  merge(diffs: Diff[]): Diff[];

  // Interactive application
  applyInteractive(text: string, diff: Diff): Promise<ApplyResult>;
}

interface Diff {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: Change[];
}

interface Change {
  type: 'add' | 'delete' | 'context';
  content: string;
}
\`\`\`

## Ideal User Experience

1. **Select text → Generate diff**: User selects old and new, gets diff
2. **Apply diff to multiple files**: Pattern-based replacement
3. **Preview with syntax highlighting**: Colors show additions/deletions
4. **Granular control**: Toggle individual changes on/off
5. **One-click undo**: Store reverse diffs automatically
6. **Collaboration**: Share diffs as patches, apply remotely
7. **Version integration**: Diffs become the commit content

The git diff format is elegant because it's **declarative** (describes what should be, not how to transform), **composable**, and **reversible**. Building an edit tool around these principles creates something more robust than line-number-based editing.
