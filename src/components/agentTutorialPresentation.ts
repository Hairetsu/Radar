import type { AgentTutorialDisposition } from "../types";

export function dispositionTone(disposition: AgentTutorialDisposition) {
  if (disposition === "cve-review") {
    return "danger" as const;
  }
  if (disposition === "vendor-report") {
    return "warn" as const;
  }
  if (disposition === "local-hardening") {
    return "move" as const;
  }
  return "good" as const;
}
