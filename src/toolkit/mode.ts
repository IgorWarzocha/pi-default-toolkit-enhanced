import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Mode } from "./types.js";

function pick(mode: Mode): string[] {
  if (mode === "rfc_xml") {
    return ["read", "bash", "edit", "write"];
  }
  if (mode === "read") {
    return ["read", "bash", "edit", "write"];
  }
  if (mode === "apply_patch") {
    return ["apply_patch"];
  }
  if (mode === "both") {
    return ["read", "bash", "apply_patch"];
  }
  return ["read", "bash", "edit", "write"];
}

export function apply(pi: ExtensionAPI, mode: Mode): void {
  const all = pi.getAllTools().map((tool) => tool.name);
  const want = pick(mode);
  const next = want.filter((name) => all.includes(name));
  if (next.length === 0) {
    throw new Error("Toolkit mode cannot be applied because no target tools are available.");
  }
  pi.setActiveTools(next);
}
