import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read/tool.js";
import { setupReadGuard } from "./src/read/guard.js";
import { setupApplyGuard } from "./src/apply/guard.js";
import { registerApplyTool } from "./src/apply/tool.js";

export default function applyPatchExtension(pi: ExtensionAPI) {
  registerReadTool(pi);
  setupReadGuard(pi);
  setupApplyGuard(pi);
  registerApplyTool(pi);
}
