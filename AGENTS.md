 1:a0|# AGENTS

 This document applies to `pi-extensions-dev/pi-hash/`.

 ## Structure

 - `index.ts`: Extension registration and tool/guard setup.
 - `src/apply/`: Patch parser, relocation engine, and healing.
 - `src/read/`: Multi-file read tool and search executor.
 - `src/shared/`: Text normalization helpers.
 - `src/bash-guard.ts`: Safety interception for shell writes.

 ## Rules
- The agent MUST NOT run tests proactively.
- The agent MAY run tests ONLY upon explicit user request.

## Inter-Session Communication Protocol

- The agent MUST use `send_to_session` for cross-session communication.
- The agent MUST target the peer via `sessionName` or `sessionId`.
- The agent SHOULD send one message per request with `wait_until: "turn_end"` when a response is required.
- The agent MUST NOT send a duplicate follow-up prompt solely to fetch the same completion.
- The agent SHOULD NOT chain a second `send_to_session` call after a successful `turn_end` response.
- The agent MAY use `get_message` or `get_summary` only when explicit polling is required.
- The agent MUST use `list_sessions` only for discovery when the target identity is unknown.
