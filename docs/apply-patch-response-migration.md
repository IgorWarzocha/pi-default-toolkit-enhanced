# Apply Patch Response Migration

## Overview

The apply patch tool now returns one canonical `details` shape that matches `ApplyResponse`.

Callers MUST consume `details.ok`, `details.phase`, `details.summary`, `details.files`, and `details.errors`.

Legacy summary-style details payloads are removed.

## Before

```ts
{
  content: [{ type: "text", text: "..." }],
  isError: boolean,
  details: {
    created: string[],
    edited: string[],
    moved: string[],
    deleted: string[],
    failed: Array<{ path: string; error: string }>,
    fileDiffs: Array<...>
  }
}
```

## After

```ts
{
  content: [{ type: "text", text: "..." }],
  isError: boolean,
  details: {
    ok: boolean,
    phase: "parse" | "preflight" | "commit",
    summary: {
      files: number,
      hunks: number,
      additions: number,
      deletions: number,
      alreadyApplied: number
    },
    fileDiffs: Array<{
      status: "C" | "E" | "D" | "MV",
      path: string,
      moveFrom?: string,
      diff: string
    }>,
    files: Array<{
      pathOld: string,
      pathNew: string,
      operation: "create" | "edit" | "move" | "delete",
      status: "applied" | "already_applied" | "rejected",
      hunks: Array<{
        path: string,
        hunk: number,
        status: "applied" | "already_applied" | "rejected",
        relocatedBy: number,
        fuzzUsed: number
      }>
    }>,
    errors: Array<{
      code: string,
      message: string,
      path: string,
      hunk: number | null,
      expected: string | null,
      actual: string | null,
      candidates: string[],
      remedy: string
    }>
  }
}
```

## Error code mapping

The implementation returns typed codes including:

- `PatchParseError`
- `ContextMismatchError`
- `AmbiguousApplyError`
- `PathPolicyError`
- `UnsupportedFeatureError`
- `TransactionError`
- `PatchValidationError`

Callers SHOULD branch on `details.errors[].code` instead of free-form message text.

## Caller update checklist

1. Replace reads of `details.created/edited/moved/deleted` with `details.files`.
2. Replace reads of `details.failed` with `details.errors`.
3. Use `details.ok` and `details.phase` for flow control.
4. Use `details.summary.alreadyApplied` for retry handling metrics.
