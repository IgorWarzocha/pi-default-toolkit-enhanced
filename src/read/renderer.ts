import { keyHint, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ReadHashDetail } from "./types.js";

export function renderReadHash(result: AgentToolResult<unknown>, options: { expanded?: boolean }, theme: Theme) {
  const container = new Container();
  const details = result.details as Record<string, unknown> | undefined;
  const files = (details?.files ?? []) as ReadHashDetail[];

  if (!options.expanded) {
    for (const detail of files) {
      if (detail.error) {
        container.addChild(new Text(theme.fg("error", `read ${detail.path}\nERROR: ${detail.error}`), 0, 0));
        continue;
      }
      const range =
        detail.offset !== undefined || detail.limit !== undefined
          ? `:${detail.offset ?? 1}${detail.limit !== undefined ? `-${(detail.offset ?? 1) + detail.limit - 1}` : ""}`
          : "";
      const search = detail.search
        ? theme.fg("muted", ` search=${detail.regex ? "/" : '"'}${detail.search}${detail.regex ? "/" : '"'}${typeof detail.matches === "number" ? ` matches=${detail.matches}` : ""}`)
        : "";
      container.addChild(
        new Text(`${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", detail.path)}${theme.fg("warning", range)}${search}`, 0, 0),
      );
    }
    if (files.length > 0) {
      container.addChild(new Text(theme.fg("muted", `(${keyHint("expandTools", "to expand output")})`), 0, 0));
    }
    return container;
  }

  const contentItems = result.content as Array<{ type: string; text?: string }>;
  let idx = 0;
  for (const detail of files) {
    if (detail.error) {
      container.addChild(new Text(theme.fg("error", `--- ${detail.path} ---\nERROR: ${detail.error}`), 0, 0));
      continue;
    }
    while (idx < contentItems.length) {
      const item = contentItems[idx++];
      if (item.type === "text" && item.text?.startsWith("--- ") && item.text?.endsWith(" ---")) continue;
      const text = files.length > 1 ? `${theme.fg("accent", `--- ${detail.path} ---`)}\n${theme.fg("toolOutput", item.text ?? "")}` : theme.fg("toolOutput", item.text ?? "");
      container.addChild(new Text(text, 0, 0));
      break;
    }
  }

  return container;
}
