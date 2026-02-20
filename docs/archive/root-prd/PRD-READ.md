### PRD: Hashline-Enforced Read Tool

#### 1. Purpose
Provide the agent with a view of the workspace where every line is uniquely addressable via a `LINEHASH` anchor.

**Context for Implementation:**
The read tool is the primary way the model gathers "anchors." It MUST be precise. We are integrating our "Banger" in-tool search (grep) feature so the model can find lines quickly, but we must ensure these sparse search results still provide hashes so they can be immediately used for editing.

**Reference Files:**
- `pi-extensions-dev/pi-enforce-read/read-executor.ts`: Source for the in-tool search/grep logic and multi-file handling.
- `pi-extensions-dev/pi-enforce-read/guard.ts`: Logic for blocking unauthorized bash file reads (cat/head/tail).

#### 2. Functional Requirements

**1. Output Formatting:**
- Every line returned to the model MUST follow the format: `LINEHASH|CONTENT`.
- Example: `42abcd|  const x = 10;`
  - NOTE: No separator is used between LINE and HASH. Since HASH is always letters and LINE is always digits, tokenizers split them naturally with zero separator overhead.
  - Prefix MUST end with the pipe `|` character.

**2. Integrated Search (Banger):**
- **Feature:** In-tool `grep` with `search`, `regex`, and `caseSensitive` parameters.
- **Context:** MUST support `contextBefore` and `contextAfter` line counts.
- **Hash Integrity:** Search results MUST NOT omit hashes. Every displayed line (match or context) MUST include its prefix in `LINEHASH|` format.

**3. Protocol Enforcement:**
- **Bash Blocking:** Intercept the `bash` tool. Block commands that read files directly (e.g., `cat`, `head`, `tail`, `sed -n ...p`, `grep`).
- **Reasoning:** Prevents the model from obtaining "hash-less" code, which would lead to `apply_hash` failures.

**4. Performance & UX:**
- **Multi-Read:** Support reading an array of files in one tool call.
- **TUI Integration:** Automatically collapse large outputs in the TUI to keep the terminal clean.
