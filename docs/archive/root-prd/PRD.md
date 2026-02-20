# PRD: Hashline Protocol (High-Reliability Edits)

## 1. Hashing Pipeline
1. **Normalization:** NFC -> strip invisible/zero-width chars -> absolute whitespace stripping.
2. **Algorithm:** FNV-1a (32-bit).
3. **Output:** 4-character Base26 string (`aaaa`-`zzzz`).
4. **Statelessness:** Hash is character-bound; identical content MUST produce identical hashes regardless of position.

## 2. Read Tool (`read`)
1. **Format:** Every line prefixed with `LINEHASH|` (e.g., `42abcd|`).
2. **Features:** Multi-read, range slicing, in-file grep (regex/search + context).
3. **UI:** Collapsed by default (Ctrl+O).
4. **Bash Guard:** Allows `cat/grep` but appends educational nudge message.

## 3. Mutation Engine (`apply_patch`)
1. **Spiral Search:** Outward expansion search in `+/- 100` line window.
2. **Cumulative Drift:** Track per-file line-count shifts to adjust target lines for sequential hunks.
3. **Closest Match:** Tie-break equidistant matches by selecting the one closest to the original target.
4. **Atmosticity:** Per-file atomic rollback on failure; per-call granular reporting.
5. **Live Sync:** Return new anchors for modified blocks in tool output.
