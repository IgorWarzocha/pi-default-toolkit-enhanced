import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { apply } from "./mode.js";
import { clearSystem, load, path, save, saveSystem, systemPath } from "./config.js";
import { compose } from "./prompts.js";
import { status } from "./runtime.js";
import type { Mode } from "./types.js";

function parse(value: string): Mode | undefined {
  if (value === "off") return "off";
  if (value === "rfc+xml" || value === "rfc_xml" || value === "RFC+XML") return "rfc_xml";
  if (value === "read") return "read";
  if (value === "apply_patch") return "apply_patch";
  if (value === "both") return "both";
  return undefined;
}

export function registerToolkit(pi: ExtensionAPI): void {
  pi.registerCommand("toolkit", {
    description: "Toolkit mode manager. You MUST pick one mode: off, RFC+XML, read, apply_patch, or both. You MAY enable overwrite to force a custom base system prompt.",
    handler: async (args, ctx) => {
      const current = await load();
      const arg = args.trim();
      const direct = parse(arg);
      if (direct) {
        const next = { mode: direct, overwrite: direct === "off" ? false : current.overwrite };
        if (next.mode === "off") {
          const wipe = await ctx.ui.confirm(
            "\u001b[31mDanger\u001b[0m",
            `\u001b[31mMode 'off' will remove ${systemPath()} if present. Are you sure?\u001b[0m`,
          );
          if (!wipe) {
            ctx.ui.notify("Toolkit unchanged.", "info");
            return;
          }
          await clearSystem();
        }
        apply(pi, next.mode);
        await save(next);
        if (next.overwrite) {
          await saveSystem(compose(next.mode));
        }
        status(ctx, next);
        ctx.ui.notify(`Toolkit updated: mode=${next.mode}, overwrite=${next.overwrite}.`, "info");
        return;
      }
      const option = await ctx.ui.select("Toolkit mode", ["off", "RFC+XML", "read", "apply_patch", "both"]);
      if (!option) {
        ctx.ui.notify("Toolkit unchanged.", "info");
        return;
      }
      const mode = parse(option);
      if (!mode) {
        throw new Error(`Invalid toolkit mode: ${option}`);
      }
      let overwrite = false;
      if (mode === "off") {
        const wipe = await ctx.ui.confirm(
          "\u001b[31mDanger\u001b[0m",
          `\u001b[31mMode 'off' will remove ${systemPath()} if present. Are you sure?\u001b[0m`,
        );
        if (!wipe) {
          ctx.ui.notify("Toolkit unchanged.", "info");
          return;
        }
        await clearSystem();
      } else {
        overwrite = await ctx.ui.confirm(
          "System prompt overwrite",
          `Overwrite ${systemPath()} with toolkit base prompt for mode '${mode}'?`,
        );
      }
      const next = { mode, overwrite };
      apply(pi, next.mode);
      await save(next);
      if (next.overwrite) {
        await saveSystem(compose(next.mode));
      }
      status(ctx, next);
      ctx.ui.notify(`Toolkit saved to ${path()}. mode=${next.mode}, overwrite=${next.overwrite}.`, "info");
    },
  });
}
