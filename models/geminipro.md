Here is the content for the `gemini.md` file. It contains an exhaustive, low-level breakdown of Git diff formats, followed by an architectural and conceptual design for an AI-native code editing tool based on those formats.

***

```markdown
# Gemini's Comprehensive Analysis of Git Diff Formats & AI-Native Edit Tool Design

This document serves as an exhaustive reference on the anatomy of Git diff formats, followed by a conceptual blueprint for an ideal, AI-driven code editing tool designed to leverage, augment, and transcend these formats.

---

## Part I: An Ultra-Thorough Understanding of Git Diff Formats

Git utilizes several diff formats, but the most prominent is the **Git Unified Diff format**. It is a heavily extended version of the standard unified diff (`diff -u`). To build tooling around it, one must understand its exact anatomy down to the character level.

### 1. The Git Unified Diff: Anatomical Breakdown

A standard `git diff` output is divided into multiple sections per file changed.

#### A. The Git Header
Every changed file starts with a Git header.
```diff
diff --git a/src/main.py b/src/main.py
```
*   **`diff --git`**: Indicates the start of a new file diff.
*   **`a/` and `b/`**: The standard prefixes. `a/` represents the source (old) state, `b/` represents the destination (new) state. (Note: Git allows changing these prefixes via `core.noprefix` or `--src-prefix`, which strict parsers must account for).

#### B. Extended Header Lines (Metadata)
Git injects metadata immediately after the Git header. This is what makes a Git diff strictly more powerful than a GNU diff.
```diff
old mode 100644
new mode 100755
index 83db48f..f92411e
--- a/src/main.py
+++ b/src/main.py
```
*   **`old mode` / `new mode`**: Represents file permission changes. `100644` is standard file, `100755` is executable, `120000` is a symlink.
*   **`index <hash>..<hash> [mode]`**: The abbreviated SHA-1 (or SHA-256) blob object hashes before and after the change. The optional mode appears here if it hasn't changed.
*   **Renames and Copies**:
    *   `rename from <path>` / `rename to <path>`
    *   `copy from <path>` / `copy to <path>`
    *   `similarity index <number>%` (Git's heuristic for tracking renames of modified files).
*   **File Creation/Deletion**:
    *   `new file mode <mode>`
    *   `deleted file mode <mode>`

#### C. The File Markers
```diff
--- a/src/main.py
+++ b/src/main.py
```
*   `---`: The original file. If it's a new file, this is `--- /dev/null`.
*   `+++`: The modified file. If it's a deleted file, this is `+++ /dev/null`.

#### D. The Hunk Header
Hunks are the actual blocks of change.
```diff
@@ -10,7 +10,8 @@ def calculate_total(items):
```
*   **Format**: `@@ -<start_line>,<number_of_lines> +<start_line>,<number_of_lines> @@ [context]`
*   **`-10,7`**: In the original file, this hunk starts at line 10 and spans 7 lines. *(If the number of lines is 1, the `,1` is omitted)*.
*   **`+10,8`**: In the new file, this hunk starts at line 10 and spans 8 lines.
*   **Context**: Everything after the closing `@@` is optional context (usually the name of the function or class). Git derives this using regex patterns defined in `.gitattributes`.

#### E. The Hunk Body
Every line in the hunk body begins with a specific character:
*   ` ` (Space): A context line (unchanged).
*   `-` (Minus): A deleted line.
*   `+` (Plus): An added line.
*   `\` (Backslash): Used specifically for `\ No newline at end of file`. If a file doesn't end with a newline character, Git explicitly flags it to prevent file concatenation bugs.

### 2. Edge Cases and Alternative Formats

To build robust tooling, one must understand Git's alternative diff representations:

*   **Combined Diffs (Merge Conflicts)**: Used when viewing a merge commit. Instead of `a/` and `b/`, it shows changes relative to multiple parents. Hunk headers look like `@@@ -1,4 -1,4 +1,4 @@@`, and change lines use columns (e.g., ` +` means added in parent 1, `+ ` means added in parent 2).
*   **Raw Format (`git diff --raw`)**: Plumb-level output.
    `:<old_mode> <new_mode> <old_sha> <new_sha> <status> <path>`
    Essential for scripting because it bypasses line-level text generation and just reports the state machine transitions (A=Added, M=Modified, D=Deleted, R=Renamed).
*   **Word Diff (`git diff --word-diff`)**: Changes are tracked inline. `[-deleted-]` and `{+added+}`. Highly useful for Markdown or natural language files where line-based diffs destroy context.
*   **Binary Diffs**: Git can embed binary changes directly in a patch file using a base85 encoding scheme, prefaced by `GIT binary patch`.

---

## Part II: Designing the Ideal AI-Native Edit Tool

If I (an LLM) were to design an edit tool based on my understanding of Git diff formats, I would not use the Git Unified Diff format as my direct output mechanism.

### The Core Problem: The LLM Line-Number Hallucination
Unified Diffs require mathematically perfect hunk headers (`@@ -L,S +L,S @@`). LLMs are autoregressive token predictors; we do not possess an internal state capable of counting exact lines in a 1,000-line file without iterating through them. If an LLM miscounts a hunk header by 1 line, standard `patch` or `git apply` will often reject the hunk entirely.

### The Solution: The "Semantic Patch" Architecture

The ideal edit tool sits as an intermediary engine between the AI's intent and Git's strict application layer. It uses a custom format for the AI, and compiles it down to a strict Git unified diff for application.

#### 1. The Intermediary AI Format: "Fuzzy Search/Replace Blocks"
Instead of generating Unified Diffs, the AI generates **Search/Replace Blocks (SRBs)**.

```text
<<<< SEARCH [src/main.py]
def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total
==== REPLACE
def calculate_total(items, apply_tax=False):
    total = sum(item.price for item in items)
    if apply_tax:
        total *= 1.20
    return total
>>>>
```

**Why this is superior for AI:**
*   **No line numbers required:** The LLM only needs to output enough unique context to locate the snippet.
*   **Idempotency & Resilience:** If the user manually added an empty line above `calculate_total` before the AI applied the patch, a standard unified diff might fail. An SRB engine will fuzzy-match the Search block and still apply the change successfully.

#### 2. The Engine Pipeline
The edit tool operates via the following pipeline:

1.  **Context Injection (Read)**:
    *   The tool reads the target codebase. Instead of sending raw text, it sends the AI an **Outline** (via Tree-sitter AST parsing) and the full text of requested files.
2.  **Intent Generation (AI)**:
    *   The AI streams the SRBs (as shown above).
3.  **The Diff Compiler (The Magic)**:
    *   The tool receives the SRB.
    *   It locates the exact line numbers of the `SEARCH` block in the local file system.
    *   It calculates the Levenshtein distance if there is a minor mismatch, finding the "best fit" location.
    *   *Crucial Step*: The tool **compiles** the SRB into a perfect, mathematically correct Git Unified Diff in memory.
4.  **Application (`git apply`)**:
    *   The tool runs `git apply --cached` (applying the compiled unified diff directly to the Git index).
    *   This provides a massive UX advantage: the user can review the AI's changes using standard `git diff --cached` before committing.

#### 3. Advanced Tool Features Built Around Git Diff Mechanics

To make this the *ultimate* edit tool, I would incorporate the following Git-specific features:

*   **Intelligent Context Expansion**: If the tool cannot uniquely match the `SEARCH` block (e.g., the AI tried to replace `return True`, which appears 50 times in the file), the tool automatically sends an error to the AI: *"Search block ambiguous. Matches lines 40, 82, and 105. Please provide 3 more lines of context."*
*   **Word-Diff Mode for Docs**: If the file being edited is `.md` or `.txt`, the tool automatically instructs the AI to use a word-level diff format, preventing the AI from rewriting an entire paragraph just to change one comma.
*   **AST-Aware Hunk Splitting**: If the AI attempts to rewrite two separate functions in one massive Replace block, the tool parses the Python/JS/etc. file using Tree-sitter, splits the single AI instruction into two distinct Git hunks, and stages them separately. This allows the human user to `git add -p` the AI's suggestions easily.
*   **Auto-Resolution of Whitespace**: LLMs frequently mess up indentation. The Diff Compiler would read the `.editorconfig` or detect local file indentation. If the AI outputs a 4-space indent Replace block into a 2-space indented file, the Compiler adjusts the whitespace *before* generating the final Git Unified Diff.

### Summary of the Edit Tool Philosophy

Git unified diffs are the perfect **machine-to-machine** and **machine-to-human** format. They are, however, a terrible **AI-to-machine** format due to their strict mathematical constraints (line numbers, exact context lines).

By designing an edit tool that allows the AI to communicate in highly contextual, semantic Search/Replace blocks—and using a local, deterministic engine to compile those blocks into perfect Git diffs—we achieve the best of both worlds: LLM flexibility without sacrificing Git's strict version control guarantees.
```
