import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { detectBashWriteViolation } from "../bash-guard.js";

export function setupApplyGuard(pi: ExtensionAPI): void {
  let calls = 0;

  pi.on("turn_start", () => {
    calls = 0;
  });

  pi.on("session_start", () => {
    const current = new Set(pi.getActiveTools());
    current.add("apply_patch");
    current.delete("edit");
    current.delete("write");
    pi.setActiveTools([...current]);
  });

  pi.on("tool_call", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: `The '${event.toolName}' tool is disabled. Use apply_patch for all file modifications.`,
      };
    }

    if (event.toolName === "bash") {
      const command = ((event.input.command as string) || "").trim();
      const violation = detectBashWriteViolation(command);
      if (violation) {
        return {
          block: true,
          reason: violation,
        };
      }
    }

    if (event.toolName !== "apply_patch") return;
    if (calls > 0) {
      return {
        block: true,
        reason:
          "Multiple apply_patch calls in the same turn are blocked. You MUST batch all related file changes into one apply_patch envelope. You MUST NOT emit sequential apply_patch calls for the same request.",
      };
    }
    calls += 1;
  });
}
