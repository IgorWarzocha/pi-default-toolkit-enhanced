# Git Diff Formats and Edit Tool Design

## Git Diff Formats

### Unified Diff (Default)
The unified diff format is the standard for code changes. It provides context around modifications, making it robust against line shifts.

- **Header**: `--- a/path` and `+++ b/path` indicate the source and destination.
- **Hunk Header**: `@@ -start,len +start,len @@`. 
    - `-start,len`: Original file starting line and number of lines.
    - `+start,len`: New file starting line and number of lines.
- **Context lines**: Lines starting with a space (` `) must match the target file exactly.
- **Deletions**: Lines starting with `-`.
- **Additions**: Lines starting with `+`.
- **No Newline**: `\ No newline at end of file` indicates the file does not end with a LF.

### Other Formats
- **Context Diff**: Uses `***` and `---` for file markers and `!`, `+`, `-` for changes. Rarer today.
- **Raw Format**: Low-level representation used internally by Git.
- **Combined Diff**: Used for merges, showing changes from multiple parents simultaneously (`@@@`).

### Hunk Header Mechanics
The hunk header `@@ -start,len +start,len @@` is a mathematical contract.
- `len` is the count of lines in that hunk, including context, additions, and deletions.
- For a single-line file, `len` might be omitted in some implementations (`@@ -1 +1 @@`).
- If `len` is 0, it means an empty file or a specific insertion point.

### Combined Diffs (`--cc`)
Used for merge commits.
- Header: `@@@ -<file1_start>,<file1_len> -<file2_start>,<file2_len> +<new_start>,<new_len> @@@`.
- Symbols: ` -` means deleted from parent 1, ` -` means deleted from parent 2, `++` means added in both.

### Special Cases
- **No Newline**: If a file ends without a newline, Git appends `\ No newline at end of file`. An edit tool must respect this; failing to do so can cause unwanted diff noise in future commits.
- **Binary Files**: Diff markers are replaced by `Binary files a/path and b/path differ`. An edit tool should probably refuse to patch these unless using a specialized binary patch format.

---

## Ideal Edit Tool Design: Technical Specification

### 1. Pre-processing: Normalization
Before application, normalize the input diff and the target file:
- Collapse multiple spaces into one for context matching (optional/fuzzy).
- Strip trailing whitespace from both.
- Detect line-ending style (LF vs CRLF) and adapt the patch.

### 2. Search Algorithm
1. **Direct Match**: Try applying at the line number specified in the header.
2. **Scanning**: If failed, scan upwards and downwards from the target line.
3. **Global Scan**: If still failed, scan the entire file for the context block.
4. **Context Reduction**: If a full context block isn't found, try matching with only 1 line of context instead of 3.

### 3. Safety Mechanisms
- **Integrity Check**: Validate that the hunk doesn't overlap with another hunk in the same transaction.
- **Atomic Rollback**: If one hunk in a multi-hunk patch fails and strict mode is on, the entire file should remain untouched.
- **Verification Hash**: Optionally include the source blob hash in the tool call to ensure the file hasn't changed since the agent last read it.
