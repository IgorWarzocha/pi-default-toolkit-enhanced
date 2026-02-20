import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read/tool.js";
import { setupReadGuard } from "./src/read/guard.js";
import { setupApplyGuard } from "./src/apply/guard.js";
import { registerApplyTool } from "./src/apply/tool.js";
import { registerToolkit } from "./src/toolkit/command.js";
import { load } from "./src/toolkit/config.js";
import { apply } from "./src/toolkit/mode.js";
import { prompt, status } from "./src/toolkit/runtime.js";

export default function applyPatchExtension(pi: ExtensionAPI) {
  registerReadTool(pi);
  setupReadGuard(pi);
  setupApplyGuard(pi);
  registerApplyTool(pi);
  registerToolkit(pi);

  pi.on("session_start", async (_event, ctx) => {
    const cfg = await load();
    apply(pi, cfg.mode);
    status(ctx, cfg);
  });

  pi.on("before_agent_start", async (event) => {
    const cfg = await load();
    return { systemPrompt: prompt(event, cfg) };
  });
}
