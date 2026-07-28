import type { AgentRun, AgentToolCall, AgentToolResult } from "../../../shared/agent-types.js";
import type { AgentRuntimeDeps, RunCounters } from "../runtimeTypes.js";

export type AgentToolExecutionContext = {
  run: AgentRun;
  counters: RunCounters;
  call: AgentToolCall;
  deps: AgentRuntimeDeps;
};

export type AgentToolFamilyExecutor = (
  context: AgentToolExecutionContext
) => Promise<AgentToolResult | null>;

