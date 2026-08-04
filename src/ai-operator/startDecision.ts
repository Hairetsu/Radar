import { isAllowedTarget } from "../../shared/allowlist.js";
import { firstUrlFromText, normalizeUrl, originFromUrl } from "../../shared/url.js";

export type AgentStartDecision =
  | { type: "reject"; reason: string }
  | { type: "propose-scope"; origin: string; startUrl: string }
  | { type: "start"; goal: string; startUrl: string };

export function decideAgentRunStart({
  goal,
  browserUrl,
  targets,
  workspaceAvailable
}: {
  goal: string;
  browserUrl: string;
  targets: readonly string[];
  workspaceAvailable: boolean;
}): AgentStartDecision {
  const trimmedGoal = String(goal || "").trim();
  if (!trimmedGoal) {
    return { type: "reject", reason: "Describe a goal before starting AI-First." };
  }
  if (!workspaceAvailable) {
    return { type: "reject", reason: "The Radar workspace is unavailable. Open it before starting a run." };
  }

  const goalUrl = firstUrlFromText(trimmedGoal);
  const startUrl = goalUrl || normalizeUrl(browserUrl);
  const origin = originFromUrl(startUrl);
  if (!origin) {
    return { type: "reject", reason: "Radar could not derive a valid HTTP or HTTPS start URL." };
  }
  if (!isAllowedTarget(startUrl, [...targets])) {
    return { type: "propose-scope", origin, startUrl };
  }
  return { type: "start", goal: trimmedGoal, startUrl };
}
