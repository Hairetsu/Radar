import type { AgentToolResult } from "../../../shared/agent-types.js";
import { executeBrowserTool } from "./browserTools.js";
import { executeEvidenceTool } from "./evidenceTools.js";
import { executeProjectTool } from "./projectTools.js";
import { executeTestingTool } from "./testingTools.js";
import type { AgentToolExecutionContext, AgentToolFamilyExecutor } from "./types.js";

const toolFamilies: AgentToolFamilyExecutor[] = [
  executeBrowserTool,
  executeEvidenceTool,
  executeTestingTool,
  executeProjectTool
];

export async function executeAgentTool(
  context: AgentToolExecutionContext
): Promise<AgentToolResult> {
  const { call, run } = context;
  try {
    if (
      (call.tool === "getCookies" || call.tool === "getStorageState") &&
      !run.policy.allowRawContext
    ) {
      throw new Error("Raw cookie and storage values require the run's explicit raw-context opt-in.");
    }
    for (const executeFamily of toolFamilies) {
      const result = await executeFamily(context);
      if (result) {
        return result;
      }
    }
    return {
      tool: call.tool,
      ok: false,
      error: `No executor is registered for ${call.tool}.`
    };
  } catch (error) {
    return {
      tool: call.tool,
      ok: false,
      error: error instanceof Error ? error.message : "Agent tool failed."
    };
  }
}

