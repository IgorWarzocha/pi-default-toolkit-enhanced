# Git Line Model

A comprehensive guide to git diff formats and their application in edit tool design.

## The Unified Diff Format

### Anatomy of a Diff

A unified diff consists of a header followed by one or more hunks.

```
--- a/path/to/file.txt
+++ b/path/to/file.txt
@@ -start,count +start,count @@ optional section heading
 context line
-removed line
+added line
 context line
```

### Header Components

```
--- a/file.txt    Source file path (prefixed with a/ for git)
+++ b/file.txt    Target file path (prefixed with b/ for git)
```

The `a/` and `b/` prefixes distinguish source from target. Git uses these to track renames and moves. A file creation shows:

```
--- /dev/null
+++ b/newfile.txt
```

A deletion shows:

```
--- a/oldfile.txt
+++ /dev/null
```

### Hunk Header

```
@@ -old_start,old_count +new_start,new_count @@ optional_heading
```

- `old_start`: 1-indexed line number in source file where hunk begins
- `old_count`: number of lines taken from source file
- `new_start`: 1-indexed line number in target file where hunk begins  
- `new_count`: number of lines in target file after applying hunk
- `optional_heading`: Git extracts context from the file (function name, class name, etc.)

The counts include context lines plus removed/added lines. When count is 1, it may be omitted:

```
@@ -5 +5 @@ means @@ -5,1 +5,1 @@
```

### Line Prefixes

| Prefix | Meaning |
|--------|---------|
| ` ` (space) | Context line - exists in both versions |
| `-` | Line removed from source |
| `+` | Line added to target |
| `\` | No newline at end of file (special marker) |

### Multiple Hunks

When changes are separated by unchanged lines, multiple hunks are generated:

```
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 first line
-second line
+second line modified
 third line
@@ -10,2 +10,2 @@
 tenth line
-eleventh line
+eleventh line modified
```

## Extended Diff Features

### File Mode Changes

```
old mode 100644
new mode 100755
```

Indicates permission changes (e.g., making a file executable).

### Renames and Copies

```
rename from oldname.txt
rename to newname.txt
similarity index 87%
```

Or for copies:

```
copy from source.txt
copy to destination.txt
similarity index 100%
```

The similarity index indicates percentage of matching content.

### Binary Files

```
Binary files a/image.png and b/image.png differ
```

Or with `--binary`:

```
GIT binary patch
literal 1234
zcmV;p1K^N!...
```

### Git Diff Extensions

Extended header lines appear before the standard diff:

```
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt
```

- `index`: SHA-1 hashes of source and target blobs, followed by mode
- `new file mode`: Mode for newly created files
- `deleted file mode`: Mode for deleted files

## Diff Context Depth

### Default Context

Git uses 3 lines of context by default (`-U3`). This provides enough context to uniquely identify where changes belong while keeping diffs readable.

### Zero Context

With `-U0`, no context lines appear:

```
@@ -5,1 +5,1 @@
-removed
+added
```

This produces minimal diffs but risks misapplication if the same lines appear elsewhere.

### Full Context

With `-U999999` or similar, the entire file becomes context. Useful for certain patching scenarios.

## Three-Way Merge Markers

When conflicts occur during merge:

```
<<<<<<< HEAD
content from current branch
=======
content from merging branch
>>>>>>> branch-name
```

The structure:
- `<<<<<<< marker`: Start of current branch content
- `=======`: Separator
- `>>>>>>> marker`: End of incoming content

These markers include optional labels identifying the conflict sources.

## Designing an Edit Tool Around Diffs

### Core Philosophy

An edit tool built on diff formats should treat the diff as the fundamental unit of change, not as an afterthought. The diff format already encodes:

1. **Precise location**: Line numbers and context
2. **Intent**: What changed and why
3. **Reversibility**: Every diff can be inverted
4. **Composability**: Diffs can be combined or split

### Ideal Tool Interface

```
apply_diff(
  diff: string,           // Unified diff content
  files: file_map,        // Map of file paths to contents
  options: {
    fuzz: number,         // Fuzzy matching factor
    strict: boolean,      // Reject ambiguous matches
    dry_run: boolean,     // Preview without applying
    reverse: boolean,     // Apply in reverse
  }
) -> result {
  applied: boolean,
  rejects: hunk[],        // Hunks that couldn't apply
  shifts: shift_map,      // Line number adjustments
}
```

### Key Design Principles

#### 1. Context as Anchor

The context lines serve as anchors. When applying a diff:

1. Search for context match starting at the nominal line number
2. Allow fuzzy matching for minor whitespace differences
3. Reject if multiple matches exist and strict mode enabled
4. Report shift distance if applied at different location than expected

```
function find_hunk_anchor(content, hunk, start_line, fuzz_factor) {
  const context = extract_context_lines(hunk);
  
  for (let offset = 0; offset <= fuzz_factor; offset++) {
    if (matches_at(content, context, start_line + offset)) {
      return { line: start_line + offset, confidence: 1 - offset/fuzz_factor };
    }
    if (matches_at(content, context, start_line - offset)) {
      return { line: start_line - offset, confidence: 1 - offset/fuzz_factor };
    }
  }
  
  return null;
}
```

#### 2. Incremental Application

Hunks must be applied in order, tracking line shifts:

```
let total_shift = 0;
for (const hunk of hunks) {
  const adjusted_start = hunk.old_start + total_shift;
  const result = apply_hunk(content, hunk, adjusted_start);
  if (!result.success) return result;
  total_shift += result.line_shift;
}
```

#### 3. Idempotency

Applying an already-applied diff should be a no-op, not an error:

```
if (content_already_matches_target(content, hunk)) {
  return { success: true, already_applied: true };
}
```

#### 4. Atomicity

Either all hunks apply, or none do. Track modifications in a buffer:

```
const buffer = content.slice();
const applied = [];

for (const hunk of hunks) {
  const result = try_apply(buffer, hunk);
  if (result.success) {
    applied.push(result);
  } else {
    // Rollback nothing - buffer was never mutated
    return { success: false, failed_hunk: hunk, reason: result.reason };
  }
}

return { success: true, buffer };
```

#### 5. Conflict Detection

Before applying, check if the region has been modified:

```
function detect_conflict(content, hunk, start) {
  const expected_context = hunk.context_lines;
  const actual_content = content.slice(start, start + expected_context.length);
  
  if (!deep_equal(expected_context, actual_content)) {
    return {
      conflict: true,
      expected: expected_context,
      actual: actual_content,
      type: 'context_mismatch'
    };
  }
}
```

### Advanced Features

#### Semantic Diff

Beyond line-based diffs, track semantic units:

```
function semantic_diff(before, after, language) {
  const before_ast = parse(before, language);
  const after_ast = parse(after, language);
  
  return diff_asts(before_ast, after_ast);
}
```

This enables:

- Function-level changes
- Class method reordering
- Import deduplication
- Structural preservation

#### Diff Generation

Generate minimal diffs from before/after:

```
function generate_diff(before, after, options) {
  const lcs = longest_common_subsequence(before, after);
  const hunks = build_hunks(lcs, before, after);
  
  return format_unified_diff(hunks, options);
}
```

The Myers diff algorithm is standard, but patience diff produces more human-readable results for code.

#### Diff Composition

Combine multiple diffs:

```
function compose_diffs(diff1, diff2) {
  // Apply diff1 to get intermediate state
  // Apply diff2 to intermediate state
  // Generate single diff from original to final
}
```

#### Conflict Resolution Strategies

```
type ResolutionStrategy = 
  | 'ours'      // Keep current
  | 'theirs'    // Accept incoming
  | 'union'     // Keep both
  | 'manual'    // Mark for resolution
  | 'smart';    // Language-aware merge
```

### Error Handling

#### Ambiguous Match

```
error AmbiguousMatch {
  hunk: hunk,
  locations: [
    { line: 10, confidence: 0.95 },
    { line: 25, confidence: 0.95 },
  ],
  message: "Context matches multiple locations; use more context or stricter matching"
}
```

#### Context Drift

```
error ContextDrift {
  hunk: hunk,
  expected_line: 42,
  actual_line: 45,
  shift: 3,
  message: "Hunk applied 3 lines from expected location"
}
```

#### Content Mismatch

```
error ContentMismatch {
  hunk: hunk,
  expected: "const x = 1;",
  actual: "const x = 2;",
  message: "Context doesn't match; file may have been modified"
}
```

### File Operations via Diff

#### Create File

```
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,3 @@
+line one
+line two
+line three
```

#### Delete File

```
--- a/oldfile.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line one
-line two
-line three
```

#### Rename File

```
rename from oldname.txt
rename to newname.txt
--- a/oldname.txt
+++ b/newname.txt
```

Or full form:

```
--- a/oldname.txt
+++ b/newname.txt
@@ -1,1 +1,1 @@
-same content
+same content
```

### Chunking Large Diffs

For large changes, split into manageable hunks:

```
function chunk_diff(diff, max_hunks = 10) {
  const hunks = parse_hunks(diff);
  const chunks = [];
  
  for (let i = 0; i < hunks.length; i += max_hunks) {
    chunks.push(hunks.slice(i, i + max_hunks));
  }
  
  return chunks;
}
```

Apply chunk by chunk with user confirmation between each.

### Verification

After application, verify integrity:

```
function verify_application(original, diff, result) {
  const expected = apply_diff_to_string(original, diff);
  const actual = result.content;
  
  if (expected !== actual) {
    throw new Error("Application verification failed");
  }
}
```

## Practical Patterns

### Pattern: Idempotent Patch

```
function idempotent_patch(content, diff) {
  // Check if already applied
  if (can_apply_reverse(content, diff)) {
    return { status: 'already_applied', content };
  }
  
  // Check if can apply forward
  if (can_apply(content, diff)) {
    return { status: 'applied', content: apply(content, diff) };
  }
  
  return { status: 'conflict', content };
}
```

### Pattern: Three-Way Merge

```
function three_way_merge(base, ours, theirs) {
  const diff_base_ours = generate_diff(base, ours);
  const diff_base_theirs = generate_diff(base, theirs);
  
  // Try to apply both
  const merged = apply_diff(ours, diff_base_theirs);
  
  if (merged.rejects.length > 0) {
    return {
      status: 'conflict',
      content: insert_conflict_markers(merged),
    };
  }
  
  return { status: 'merged', content: merged.content };
}
```

### Pattern: Semantic Patch

```
function semantic_patch(content, pattern, replacement, language) {
  const ast = parse(content, language);
  const matches = find_matches(ast, pattern);
  
  let result = content;
  for (const match of reverse(matches)) {
    const diff = generate_diff_for_match(match, replacement);
    result = apply_diff(result, diff);
  }
  
  return result;
}
```

## Conclusion

The unified diff format provides a robust foundation for edit tools because it:

1. Encapsulates both content and location
2. Supports atomic operations through hunks
3. Enables verification through context matching
4. Allows reversibility through diff inversion
5. Handles all file operations (create, delete, rename, modify)

An ideal edit tool treats diffs as first-class citizens, not as serialization format for other operations. This enables powerful composition, verification, and conflict handling that string-based replacement cannot achieve.
