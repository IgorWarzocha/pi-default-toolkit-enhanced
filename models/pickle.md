# Git Diff Formats: Comprehensive Understanding & Edit Tool Design

## Table of Contents
1. [The Unified Diff Format](#the-unified-diff-format)
2. [Hunk Structure and Mechanics](#hunk-structure-and-mechanics)
3. [Extended Diff Headers](#extended-diff-headers)
4. [Special Diff Types](#special-diff-types)
5. [Git's Internal Diff Machinery](#gits-internal-diff-machinery)
6. [Ideal Edit Tool Design](#ideal-edit-tool-design)

---

## The Unified Diff Format

The unified diff format is the gold standard for representing file changes. It concatenates the old and new versions into a single stream, using context lines to bridge changes.

### Anatomy of a Unified Diff

```
--- a/path/to/original.txt
+++ b/path/to/modified.txt
@@ -old_start,old_count +new_start,new_count @@
 context line unchanged
 context line unchanged
-removed line
+added line
 context line unchanged
```

**The three essential components:**

1. **File headers** (`---` and `+++`)
   - Always present, even for new/deleted files
   - The `a/` and `b/` prefixes indicate the "before" and "after" states
   - For new files: `--- /dev/null`
   - For deleted files: `+++ /dev/null`

2. **Hunk headers** (`@@`)
   - Format: `@@ -old_start,old_count +new_start,new_count @@`
   - `old_start`: Line number in original file where this hunk begins
   - `old_count`: Number of lines in original file this hunk spans
   - `new_start`: Line number in modified file where this hunk begins
   - `new_count`: Number of lines in modified file this hunk spans

3. **Content lines**
   - `-`: Line removed from original
   - `+`: Line added to new
   - ` `: Unchanged context line (space character)
   - `\ No newline at end of file`: Indicates missing trailing newline

### Why Unified Diff Wins

- **Single stream**: No need to reconcile two separate files
- **Context preservation**: Human-readable, shows what changed in situ
- **Hunk boundaries**: Enables partial application
- **Line-aligned**: Maps directly to editor concepts

---

## Hunk Structure and Mechanics

### Hunk Header Deep Dive

The hunk header is the critical metadata that makes diffs machine-parseable:

```
@@ -15,7 +15,9 @@ function example() {
```

Interpretation:
- This hunk corresponds to lines 15-21 in the old file (7 lines)
- This hunk corresponds to lines 15-23 in the new file (9 lines)
- The difference (9 - 7 = 2) equals the net lines added

**Why line counts matter:**

If you know:
- The old file had N lines before this hunk
- The hunk shows `-x` removed lines and `+y` added lines
- Then new file position = N - x + y

### Hunk Merging

Adjacent or overlapping hunks can be merged:

```
@@ -10,3 +10,5 @@
+line a
+line b
@@ -15,2 +17,4 @@
+line c
+line d
```

Can become:
```
@@ -10,3 +10,7 @@
+line a
+line b
+line c
+line d
```

**Rules:**
- Minimum 3 context lines required between hunks to keep them separate
- Too-small hunks can be expanded with context to meet threshold
- `--minimal` flag tells git to find smallest possible diff

### Hunk Selection

You can extract specific hunks by line number:

```bash
git diff --no-index old.txt new.txt | sed -n '/^@@/,/^@@/p'
```

---

## Extended Diff Headers

Git extends the basic diff format with additional metadata:

### Index Line

```
index 1234567..89abcdef 100644
```

- First SHA: Blob hash of old version
- Second SHA: Blob hash of new version  
- Permissions: `100644` (regular file), `100755` (executable), `040000` (directory)

### Similarity Index (for renames/copies)

```
similarity index 95%
rename from old.txt
rename to new.txt
```

Or for copies:
```
copy from old.txt
copy to new.txt
```

### Binary Files

```
Binary files a/binary.bin and b/binary.bin differ
```

Or for binary diffs (rare):
```
GIT binary patch
[base64 encoded delta]
```

### New/Deleted File Markers

```
new file mode 100755
deleted file mode 100644
```

### Mode Changes

```
old mode 100644
new mode 100755
```

---

## Special Diff Types

### Word Diff

```bash
git diff --word-diff
```

Output:
```
foo {+bar+} baz {-quux-}
```

- `{+...+}`: Added words
- `{-...-}`: Removed words

Variants:
- `--word-diff=plain`: Uses `[-removed-]` and `{+added+}`
- `--word-diff=porcelain`: JSON-like single-line-per-change format
- `--word-diff=color`: Terminal colors only
- `--word-diff=regex`: Custom boundary with `--word-diff-regex=<pattern>`

### Character Diff

```bash
git diff --word-diff=char
```

Useful for translations or typo fixes.

### Line Prefixes

Default prefixes can be changed:
```bash
git diff --old-group-format='< %d ' --new-group-format='> %d ' \
  --changed-group-format='# %d ' --unchanged-group-format='  %d '
```

### Heuristics

Git uses Myers diff algorithm by default, but:
- `--minimal`: Spend extra CPU to find smallest diff
- `--patience`: Use patience diff algorithm (fewer, larger hunks)
- `--histogram`: Faster, often produces similar results to patience

---

## Git's Internal Diff Machinery

### The Diff Pipeline

```
[worktree] --> [index] --> [commit]
     |            |           |
  diff-files   diff-index   diff-tree
```

- **git diff-files**: Compare worktree to index
- **git diff-index**: Compare index to commit (or HEAD)
- **git diff-tree**: Compare two commits
- **git diff**: Convenience wrapper for all above

### Object Types

- **Blob**: File contents (the thing being diffed)
- **Tree**: Directory listing
- **Commit**: Snapshot with parent reference

### The Patch Object

A patch is a collection of diffs with metadata:

```typescript
interface Patch {
  oldPath: string;
  newPath: string;
  oldMode: FileMode;
  newMode: FileMode;
  oldSha: string;
  newSha: string;
  hunks: Hunk[];
  binary: boolean;
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Line[];
}

interface Line {
  type: 'context' | 'add' | 'delete';
  content: string;
}
```

### Diff Drivers

Git can use external diff programs:
```bash
git config diff.external my-diff-tool
```

---

## Ideal Edit Tool Design

### Core Philosophy

Diff formats encode *transformations* between states, not just the states themselves. This is powerful because:

1. **Reversibility**: Every change is invertible (`+` becomes `-`, and vice versa)
2. **Composability**: Patches can be stacked, merged, reordered
3. **Linearity**: Changes map to line numbers, matching editor mental model
4. **Minimality**: Only what changed is recorded

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Edit Tool                             │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Editor    │◄──►│   Diff      │◄──►│   Patch     │  │
│  │   Buffer    │    │   Engine    │    │   Store     │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │          │
│         ▼                  ▼                  ▼          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Unified Diff Format                     │ │
│  │    (Canonical interchange & persistence format)     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Features

#### 1. Native Diff Buffer Representation

Internal buffer stores changes as diff hunks, not flat text:

```typescript
class DiffBuffer {
  hunks: Map<number, Hunk>;  // keyed by old file line number
  
  // Editing operations become hunk transformations
  insert(line: number, text: string): DiffBuffer;
  delete(line: number, count: number): DiffBuffer;
  replace(line: number, oldCount: number, text: string): DiffBuffer;
}
```

**Benefits:**
- Insert at line 5 automatically generates correct `+` lines
- Delete spanning hunks intelligently merges/adjusts hunk headers
- No need to compute diff after every edit—it's always ready

#### 2. Hunk-Aware Cursor

Cursor position respects hunk structure:

```typescript
class HunkCursor {
  hunk: Hunk;
  offsetInHunk: number;  // position relative to hunk start
  
  // Moving up/down stays within hunk context when possible
  moveUp(): HunkCursor;
  moveDown(): HunkCursor;
  
  // Crossing hunk boundaries adjusts to maintain visual continuity
}
```

**Why this matters:**
- Context lines (unchanged) are visually distinct from additions/deletions
- Jumping to "line 100" can find the correct hunk first, then the line
- Selection can span hunks with intelligent boundary handling

#### 3. Intelligent Hunk Splitting/Merging

When editing within a diff, automatically adjust hunk boundaries:

```
Before edit within hunk:
@@ -10,5 +10,7 @@
  unchanged
-removed
+added1
+added2
  unchanged

After inserting new line in middle:
@@ -10,3 +10,4 @@
  unchanged
-removed
+newly_inserted
+added1
@@ -14,1 +15,2 @@
+added2
  unchanged
```

The tool detects when an edit invalidates the original hunk boundary and creates new hunks that preserve the logical change structure.

#### 4. Patch Stacking (Like git amend but for sessions)

```
┌────────────────────────────────────────┐
│ Patch Stack                            │
├────────────────────────────────────────┤
│ Layer 3: Cursor movement history       │
│ Layer 2: Recent edits (last 10)        │
│ Layer 1: Session baseline              │
│ Layer 0: Loaded file                   │
└────────────────────────────────────────┘
```

Each layer is a valid diff/patch. Undo becomes "pop layer", redo becomes "push undone layer back".

#### 5. Bi-directional Patch Application

```typescript
class BidirectionalPatch {
  apply(diff: Diff): File;
  invert(diff: Diff): Diff;  // + becomes -, - becomes +
  compose(patch1: Diff, patch2: Diff): Diff;
  merge(patch1: Diff, patch2: Diff): Diff;  // conflict detection
}
```

This enables:
- Undo (invert and apply)
- Branch switching (apply forward/backward)
- Three-way merge visualization

#### 6. Diff as Edit Language

The edit tool's "language" is the unified diff format:

```
> insert 10 "hello world"
Generated patch:
@@ -9,0 +10,1 @@
+hello world

> delete 15 3
Generated patch:
@@ -15,3 +15,0 @@
-old line 1
-old line 2
-old line 3
```

Every operation outputs a valid unified diff. This makes:
- Recording/replaying trivial
- Sharing edits as text
- Version control native (just commit the diffs)

#### 7. Semantic Hunk Grouping

Group hunks by function/scope, not just proximity:

```python
# Instead of:
@@ -10,5 +10,7 @@
...
@@ -50,3 +52,5 @@
...

# Semantic grouping:
@@ @@ [function: authenticate]
@@ -10,5 +10,7 @@
...
@@ @@ [function: api_handler]  
@@ -50,3 +52,5 @@
...
```

This enables:
- Jump to change by function name
- Apply entire function's changes atomically
- Review diff by logical unit

#### 8. Three-Way Merge Visualization

Using diff format for merge conflicts:

```
<<<<<<< HEAD
-original line
+HEAD version
=======
+incoming version
>>>>>>> feature-branch
```

The diff format naturally represents conflict markers as overlapping hunks.

#### 9. Persistent Diff History

Store every change as a diff, not full snapshots:

```
history/
  0001.patch   # First session change
  0002.patch   # Second session change
  ...
  current      # Points to latest
```

Advantages:
- Constant space per change
- Infinite undo without memory growth
- Easy to share/submit just the changes

#### 10. Diff-Based Selection and Navigation

```typescript
// Select all additions in current buffer
buffer.select({
  type: 'changes',
  filter: 'added'
});

// Select all lines that changed in hunk #3
buffer.select({
  hunk: 3,
  type: 'hunk-content'
});

// Navigate to next/previous change
buffer.gotoNextChange();  // Jumps to next +/- line
```

---

## Summary

The unified diff format is more than a git implementation detail—it's a compact, expressive representation of textual change that maps beautifully to:

- Line-based editing
- Reversible transformations  
- Patch composition and merging
- Version control semantics

An ideal edit tool would build on these strengths:

1. **Internal model**: Diffs as first-class citizens, not computed lazily
2. **Output format**: Unified diff as the canonical "save" format
3. **Operations**: Every edit produces a valid patch
4. **History**: Stack of diffs enables infinite undo with constant memory
5. **Hunk awareness**: Boundaries guide cursor, selection, and navigation
6. **Three-way thinking**: HEAD / working / incoming as first-class concepts

The diff format's decades of refinement in git provide a solid foundation—rather than reinventing change representation, the tool should embrace it as its core data structure.
