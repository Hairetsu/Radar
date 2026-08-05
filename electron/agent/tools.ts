import type { AgentToolCall, AgentToolName } from "../../shared/agent-types.js";
import {
  AGENT_TOOL_DEFINITIONS,
  type AgentToolDefinition,
  type AgentToolDescriptor
} from "./toolRegistry/definitions.js";
import { normalizeAgentToolInput } from "./toolRegistry/normalization.js";

export type { AgentToolDefinition, AgentToolDescriptor };

export const AGENT_TOOL_REGISTRY: AgentToolDescriptor[] = AGENT_TOOL_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    normalize: (input) => normalizeAgentToolInput({ tool: definition.name, input } as AgentToolCall)
  })
);

const AGENT_TOOL_DESCRIPTORS = new Map(
  AGENT_TOOL_REGISTRY.map((descriptor) => [descriptor.name, descriptor])
);

export function toolSchemas(tools: readonly AgentToolName[] = availableToolNames()) {
  const allowedTools = new Set(tools);
  return Object.fromEntries(
    AGENT_TOOL_REGISTRY.filter((tool) => allowedTools.has(tool.name)).map((tool) => [
      tool.name,
      {
        description: tool.description,
        safety: tool.safety,
        input: tool.schema
      }
    ])
  );
}

export function availableToolNames() {
  return AGENT_TOOL_REGISTRY.map((tool) => tool.name);
}

function isAgentToolName(value: string): value is AgentToolName {
  return AGENT_TOOL_REGISTRY.some((tool) => tool.name === value);
}

export function normalizeUnknownAgentToolCall(
  toolValue: unknown,
  input: unknown
): AgentToolCall {
  const tool = String(toolValue || "");
  if (!isAgentToolName(tool)) {
    throw new Error(`Invalid agent tool: ${tool}`);
  }
  return AGENT_TOOL_DESCRIPTORS.get(tool)!.normalize(input);
}

export function normalizeAgentToolCall(call: AgentToolCall): AgentToolCall {
  const descriptor = AGENT_TOOL_DESCRIPTORS.get(call.tool);
  if (!descriptor) {
    throw new Error(`Invalid agent tool: ${call.tool}`);
  }
  return descriptor.normalize(call.input);
}
