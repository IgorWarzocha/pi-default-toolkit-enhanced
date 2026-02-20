 1:a0|# AGENTS

 This document applies to `pi-extensions-dev/pi-hash/`.

 ## Structure

 - `index.ts`: Extension registration and tool/guard setup.
 - `src/apply/`: Relocation engine, hunk parsing, and healing.
 - `src/read/`: Hashed read tool and grep executor.
 - `src/shared/`: Normalized FNV-1a/xxHash32 hashing.
 - `src/bash-guard.ts`: Safety interception for shell writes.

 ## Rules
- The agent MUST NOT run tests proactively.
 - The agent MAY run tests ONLY upon explicit user request.
