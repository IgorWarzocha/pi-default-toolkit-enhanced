import { Type, type Static } from "@sinclair/typebox";

export const HashFileSchema = Type.Object({
  path: Type.String({
    description: "REQUIRED. File path to read.",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "OPTIONAL. 1-indexed start line.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Maximum number of lines to read.",
    }),
  ),
  search: Type.Optional(
    Type.String({
      description: "OPTIONAL. In-file search query.",
    }),
  ),
  regex: Type.Optional(
    Type.Boolean({
      description: "OPTIONAL. Treat search as regex.",
    }),
  ),
  caseSensitive: Type.Optional(
    Type.Boolean({
      description: "OPTIONAL. Case-sensitive search. Default false.",
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

export type HashFileInput = Static<typeof HashFileSchema>;

export type ReadHashDetail = {
  path: string;
  offset?: number;
  limit?: number;
  search?: string;
  regex?: boolean;
  matches?: number;
  truncated?: boolean;
  error?: string;
};

