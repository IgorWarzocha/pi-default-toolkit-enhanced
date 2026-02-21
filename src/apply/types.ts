export type Hunk =
  | { type: "create"; filePath: string; contents: string }
  | { type: "delete"; filePath: string }
  | { type: "move"; filePath: string; moveToPath: string }
  | {
      type: "edit";
      filePath: string;
      moveToPath?: string;
      chunks: EditFileChunk[];
    };

export type EditFileChunk = {
  changeContext?: string;
  oldLines: string[];
  oldAnchors: EditLineAnchor[];
  newLines: string[];
  isEndOfFile: boolean;
};

export type EditLineAnchor = {
  line: number;
  offset: number;
};

export type ParseErrorCode = "PatchParseError";

export class InvalidPatchError extends Error {
  readonly code: ParseErrorCode;
  readonly lineNumber: number;
  readonly expected: string[];
  readonly actual: string[];

  constructor(message: string, lineNumber = 1, expected: string[] = [], actual: string[] = []) {
    super(message);
    this.code = "PatchParseError";
    this.lineNumber = lineNumber;
    this.expected = expected;
    this.actual = actual;
  }
}

export class InvalidHunkError extends Error {
  readonly code: ParseErrorCode;
  readonly expected: string[];
  readonly actual: string[];

  constructor(
    message: string,
    readonly lineNumber: number,
    expected: string[] = [],
    actual: string[] = [],
  ) {
    super(message);
    this.code = "PatchParseError";
    this.expected = expected;
    this.actual = actual;
  }
}

export type ApplyFileDiff = {
  status: "C" | "E" | "D" | "MV";
  path: string;
  moveFrom?: string;
  diff: string;
};

export type ApplySummary = {
  created: string[];
  edited: string[];
  moved: string[];
  deleted: string[];
  failed: ApplyFailure[];
  live: ApplyLive[];
  fileDiffs: ApplyFileDiff[];
  noops: ApplyNoop[];
  hunkResults: ApplyHunkResult[];
};

export type ApplyFailure = {
  path: string;
  code?: string;
  lineNumber?: number;
  error: string;
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

export type ApplyLive = {
  path: string;
  anchors: string[];
};

export type ApplyNoop = {
  path: string;
  line: number;
  reason: string;
};

export type ApplyHunkResult = {
  path: string;
  hunk: number;
  status: "applied" | "already_applied" | "rejected";
  relocatedBy: number;
  fuzzUsed: number;
};

export type ApplyPhase = "parse" | "preflight" | "commit";

export type ApplyResponse = {
  ok: boolean;
  phase: ApplyPhase;
  summary: {
    files: number;
    hunks: number;
    additions: number;
    deletions: number;
    alreadyApplied: number;
  };
  files: Array<{
    pathOld: string;
    pathNew: string;
    operation: "create" | "edit" | "move" | "delete";
    status: "applied" | "already_applied" | "rejected";
    hunks: ApplyHunkResult[];
  }>;
  errors: Array<{
    code: string;
    message: string;
    path: string;
    hunk: number | null;
    expected: string | null;
    actual: string | null;
    candidates: string[];
    remedy: string;
  }>;
};
