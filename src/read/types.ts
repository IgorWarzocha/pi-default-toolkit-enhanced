import { Type, type Static } from "@sinclair/typebox";

export const ReadFileSchema = Type.Object({
  path: Type.String({
    description: "REQUIRED. Path to file. Relative paths are resolved from cwd. Absolute paths are allowed.",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "OPTIONAL. 1-indexed start line. MUST be >= 1 when provided.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Maximum number of lines to read. SHOULD be set for large files.",
    }),
  ),
  search: Type.Optional(
    Type.String({
      description: "OPTIONAL. Search query. When set, tool SHALL return matches and optional context.",
    }),
  ),
  contextBefore: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Context lines before each match.",
    }),
  ),
  contextAfter: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Context lines after each match.",
    }),
  ),
  maxMatches: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Max matched lines to return.",
    }),
  ),
});

export type ReadFileInput = Static<typeof ReadFileSchema>;

export type ReadDetail = {
  path: string;
  offset?: number;
  limit?: number;
  search?: string;
  matches?: number;
  truncated?: boolean;
  error?: string;
};
