### PRD: Hashing Logic & Normalization

#### 1. Purpose
Define a stable, collision-resistant (at line-level), and format-invariant identifier for code lines to serve as anchors for mutations.

**Context for Implementation:**
Hashing is the foundation of the "Relocation Engine." If the hash matches, the edit is safe even if the line number has drifted. We must borrow the advanced Unicode normalization from the existing patch extension to ensure that "smart characters" or non-standard spaces don't break our anchors.

**Reference Files:**
- `pi-extensions-dev/pi-apply-patch/src/apply.ts`: Source of `normalizeUnicode` and basic line matching logic.

#### 2. Normalization Protocol (The "Banger" Foundation)
A line MUST be normalized before hashing to ensure that LLM formatting hallucinations or Unicode variances do not cause mechanical failures.

**Steps:**
1. **Unicode Canonicalization:** Convert all non-standard characters to ASCII equivalents using the `pi-apply-patch` logic:
   - Smart quotes (`‘’“”`) → Standard quotes (`'"`).
   - Em/En-dashes (`—–−`) → Standard hyphens (`-`).
   - Non-breaking spaces/Unicode tabs → Standard space (` `).
2. **Whitespace Stripping:** Remove ALL whitespace characters (`\s+`) and carriage returns (`\r`). This makes the hash invariant to indentation changes or trailing space errors.
3. **Case Sensitivity:** Normalization MUST NOT change casing; `Function` and `function` MUST produce different hashes.

#### 3. Hashing Algorithm
1. **Algorithm:** `xxHash32` (or high-performance FNV-1a).
2. **Input:** The normalized UTF-8 string.
3. **Output Format:**
   - Truncate the hash to ~18 bits (`hash % 456976`).
   - Represent as a **4-character lowercase base26 string** (`aaaa`-`zzzz`).

#### 4. Verification Logic
The `verify(lineNo, content, expectedHash)` function MUST:
1. Compute the hash of `content` using the above protocol.
2. Return `true` if they match, `false` otherwise.

*** Add File: pi-extensions-dev/pi-hash/PRD-READ.md
### PRD: Hashline-Enforced Read Tool

#### 1. Purpose
Provide the agent with a view of the workspace where every line is uniquely addressable via a `LINE:HASH` anchor.

#### 2. Functional Requirements

**1. Output Formatting:**
- Every line returned to the model MUST follow the format: `LINE:HASH|CONTENT`.
- Example: `42:a3|  const x = 10;`

**2. Integrated Search (Banger):**
- **Feature:** In-tool `grep` with `search`, `regex`, and `caseSensitive` parameters.
- **Context:** MUST support `contextBefore` and `contextAfter` line counts.
- **Hash Integrity:** Search results MUST NOT omit hashes. Every displayed line (match or context) MUST include its `LINE:HASH|` prefix.

**3. Protocol Enforcement:**
- **Bash Blocking:** Intercept the `bash` tool. Block commands that read files directly (e.g., `cat`, `head`, `tail`, `sed -n ...p`, `grep`).
- **Reasoning:** Prevents the model from obtaining "hash-less" code, which would lead to `apply_hash` failures.

**4. Performance & UX:**
- **Multi-Read:** Support reading an array of files in one tool call.
- **TUI Integration:** Automatically collapse large outputs in the TUI to keep the terminal clean.

*** Add File: pi-extensions-dev/pi-hash/PRD-APPLY.md
### PRD: Atomic Hash-Anchored Mutation Tool (`apply_hash`)

#### 1. Purpose
A high-reliability, multi-file mutation tool that uses hashes to ensure targeted edits land on the intended content even if line numbers shift.

#### 2. Operations (The Envelope)
The tool accepts a batch of operations to ensure atomicity:

**Line-Level (Update):**
- `set_line(anchor, text)`: Replace a single anchored line.
- `replace_range(start_anchor, end_anchor, text)`: Replace a block of code.
- `insert_after(anchor, text)`: Append content after a specific anchor.

**File-Level:**
- `add_file(path, content)`
- `move_file(from_path, to_path)`
- `delete_file(path)`

#### 3. The Relocation Engine (Advanced Banger)
If an operation targets `10:a3` but line 10 no longer matches `a3`:
1. The engine MUST scan a window of +/- 100 lines.
2. If the hash `a3` is found at line 12 and is **unique** within the search window, the engine MUST relocate the edit to line 12 automatically.
3. If relocation fails (no match or ambiguous matches), the tool MUST abort the entire turn's batch.

#### 4. Safety & Heuristics
- **Bash Write Guard:** Block `echo >`, `tee`, and `sed -i` via the `bash` tool.
- **Indentation Inheritance:** Replacement text SHOULD inherit the leading whitespace of the anchor line if the model omits it.
- **Hallucination Cleaning:** Proactively strip common LLM errors from input `text` (e.g., repeating the `LINE:HASH|` prefix or diff `+` markers).

#### 5. Failure Recovery
On mismatch/relocation failure, return a "Quick Fix" payload:
- Show the `Actual State` (line number and actual hash) for the lines immediately surrounding the failed anchor.
- This allows the model to "re-anchor" without needing to perform a full `read` call.
