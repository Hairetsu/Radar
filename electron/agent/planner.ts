import type { AgentDecision, AgentDecisionContext } from "../../shared/agent-types.js";
import { complete } from "../ai/providers.js";
import { loadSettings } from "../ai/settings.js";
import { buildAgentUserPrompt } from "./planner/contextCompaction.js";
import { normalizeAgentDecision } from "./planner/decisionNormalization.js";
import { AGENT_SYSTEM_PROMPT } from "./planner/prompt.js";

export { buildAgentUserPrompt } from "./planner/contextCompaction.js";
export { normalizeAgentDecision } from "./planner/decisionNormalization.js";

function decisionRepairPrompt(user: string, error: unknown) {
  const reason = (error instanceof Error ? error.message : "The decision did not match the tool schema.")
    .replace(/\s+/g, " ")
    .slice(0, 400);
  return `${user}\n\nYour previous JSON decision was rejected at Radar's input boundary: ${reason}\nReturn a corrected JSON decision only. For runReplayExperiment, location.name is required for query, form, header, or cookie mutations; location.path is required for replace-json; and location.index is required for replace-path-segment. Use a parameterNames value from getAssessmentCandidates when the mutation needs a name.`;
}

export function createAiAgentPlanner(userDataPath: string) {
  return async (context: AgentDecisionContext): Promise<AgentDecision> => {
    const settings = loadSettings(userDataPath);
    const user = buildAgentUserPrompt(context);
    const { parsed } = await complete({
      settings,
      system: AGENT_SYSTEM_PROMPT,
      user
    });
    try {
      return normalizeAgentDecision(parsed);
    } catch (error) {
      const repaired = await complete({
        settings,
        system: AGENT_SYSTEM_PROMPT,
        user: decisionRepairPrompt(user, error)
      });
      return normalizeAgentDecision(repaired.parsed);
    }
  };
}
