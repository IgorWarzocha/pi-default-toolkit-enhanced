import type { BeforeAgentStartEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { compose, inject } from "./prompts.js";
import type { Config } from "./types.js";

const KEY = "toolkit";

export function status(ctx: ExtensionContext, cfg: Config): void {
  if (!ctx.hasUI) {
    return;
  }
  const text = `toolkit:${cfg.mode}${cfg.overwrite ? ":overwrite" : ""}`;
  ctx.ui.setStatus(KEY, ctx.ui.theme.fg("dim", text));
}

export function prompt(event: BeforeAgentStartEvent, cfg: Config): string {
  if (cfg.mode === "off" && !cfg.overwrite) {
    return event.systemPrompt;
  }
  if (cfg.overwrite) {
    return compose(cfg.mode);
  }
  return inject(event.systemPrompt, cfg.mode);
}
