import { keyHint, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ReadDetail } from "./types.js";

export function renderRead(result: AgentToolResult<unknown>, options: { expanded?: boolean }, theme: Theme) {
  const container = new Container();
  const details = result.details as Record<string, unknown> | undefined;
  const files = (details?.files ?? []) as ReadDetail[];

  if (!options.expanded) {
    for (const detail of files) {
      if (detail.error) {
        container.addChild(new Text(theme.fg("error", `read ${detail.path}\nERROR: ${detail.error}`), 0, 0));
        continue;
      }
      const range = detail.offset !== undefined || detail.limit !== undefined
        ? `:${detail.offset ?? 1}${detail.limit !== undefined ? `-${(detail.offset ?? 1) + detail.limit - 1}` : ""}`
        : "";
      const search = detail.search
        ? theme.fg("muted", ` search="${detail.search}"${typeof detail.matches === "number" ? ` matches=${detail.matches}` : ""}`)
        : "";
      container.addChild(new Text(`${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", detail.path)}${theme.fg("warning", range)}${search}`, 0, 0));
    }
    if (files.length > 0) container.addChild(new Text(theme.fg("muted", `(${keyHint("expandTools", "to expand output")})`), 0, 0));
    return container;
  }

  const items = result.content as Array<{ type: string; text?: string }>;
  for (const item of items) {
    if (item.type !== "text") continue;
    container.addChild(new Text(theme.fg("toolOutput", item.text ?? ""), 0, 0));
  }

  return container;
}
