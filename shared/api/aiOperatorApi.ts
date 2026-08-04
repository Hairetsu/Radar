import type {
  AiConnectPresetId,
  AiConnectProbe,
  AiConnectResult,
  AiModelOption,
  AiSettings
} from "../ai-types.js";
import type {
  AgentCapabilityActionRequest,
  AgentMissionSteeringRequest,
  AgentRun,
  AgentRunMemoryEntry,
  AgentRunRecoveryRequest,
  AgentRunRequest
} from "../agent-types.js";
import type { LocalContext } from "../domain.js";
import type { AiOperatorWindowApi } from "./windowCoordinationApi.js";

export type RadarAiOperatorApi = AiOperatorWindowApi & {
  getLocalContext: () => Promise<LocalContext>;
  getTargets: () => Promise<string[]>;
  getAiSettings: () => Promise<AiSettings>;
  setAiSettings: (settings: AiSettings) => Promise<AiSettings>;
  connectAi: (presetId: AiConnectPresetId) => Promise<AiConnectResult>;
  probeAiConnection: (settings: AiSettings) => Promise<AiConnectProbe>;
  loginCursor: () => Promise<AiConnectProbe>;
  getAiModels: (provider: AiSettings["provider"]) => Promise<AiModelOption[]>;
  refreshAiModels: (settings: AiSettings) => Promise<AiModelOption[]>;
  startAgentRun: (payload: AgentRunRequest) => Promise<AgentRun>;
  pauseAgentRun: (id: string) => Promise<AgentRun | null>;
  resumeAgentRun: (id: string) => Promise<AgentRun | null>;
  recoverAgentRun: (id: string, request: AgentRunRecoveryRequest) => Promise<AgentRun | null>;
  steerAgentMission: (id: string, request: AgentMissionSteeringRequest) => Promise<AgentRun | null>;
  updateAgentCapabilities: (id: string, request: AgentCapabilityActionRequest) => Promise<AgentRun | null>;
  stopAgentRun: (id: string) => Promise<AgentRun | null>;
  getAgentRun: (id: string) => Promise<AgentRun | null>;
  listAgentRuns: () => Promise<AgentRun[]>;
  getAgentRunMemory: () => Promise<AgentRunMemoryEntry[]>;
  saveAgentRunMemory: (entry: AgentRunMemoryEntry) => Promise<AgentRunMemoryEntry>;
  deleteAgentRunMemory: (id: string) => Promise<{ ok: boolean; memory: AgentRunMemoryEntry[] }>;
};

