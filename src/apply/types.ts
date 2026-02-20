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
  hash: string;
};

export class InvalidPatchError extends Error {}
export class InvalidHunkError extends Error {
  constructor(
    message: string,
    readonly lineNumber: number,
  ) {
    super(message);
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
};

export type ApplyFailure = {
  path: string;
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
