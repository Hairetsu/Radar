import type { AgentDecision, AgentDecisionContext } from "../../shared/agent-types.js";
import { complete } from "../ai/providers.js";
import { loadSettings } from "../ai/settings.js";
import { buildAgentUserPrompt } from "./planner/contextCompaction.js";
import { normalizeAgentDecision } from "./planner/decisionNormalization.js";
import { AGENT_SYSTEM_PROMPT } from "./planner/prompt.js";
export { createAiReconPlanner } from "./planner/recon.js";

export { buildAgentUserPrompt } from "./planner/contextCompaction.js";
export { normalizeAgentDecision } from "./planner/decisionNormalization.js";

export function createAiAgentPlanner(userDataPath: string) {
  return async (context: AgentDecisionContext): Promise<AgentDecision> => {
    const settings = loadSettings(userDataPath);
    const { parsed } = await complete({
      settings,
      system: AGENT_SYSTEM_PROMPT,
      user: buildAgentUserPrompt(context)
    });
    return normalizeAgentDecision(parsed);
  };
}
