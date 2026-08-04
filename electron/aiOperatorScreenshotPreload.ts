import { contextBridge } from "electron";
import type { RadarAiOperatorApi } from "../shared/api/aiOperatorApi.js";
import type { AgentRun, AgentRunMemoryEntry, AppMode } from "../shared/agent-types.js";
import { createAgentCapabilityState } from "../shared/agentCapabilities.js";
import { createAgentMission } from "../shared/agentMission.js";
import type { AiSettings } from "../shared/ai-types.js";
import type { AiOperatorSection } from "../shared/windowCoordination.js";

const localContext = {
  profile: {
    id: "profile-screenshot",
    name: "Field Operator",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  workspace: {
    id: "workspace-screenshot",
    profileId: "profile-screenshot",
    name: "Screenshot Workspace",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  session: {
    id: "session-screenshot",
    workspaceId: "workspace-screenshot",
    name: "Guided Authorization Review",
    startedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
};

let mode: AppMode = "ai-first";
let section: AiOperatorSection = "runs";
let settings: AiSettings = {
  provider: "codex-local",
  model: "auto",
  apiKey: "local",
  baseUrl: "codex://local"
};

let run: AgentRun = {
  id: "agent-screenshot",
  sessionId: localContext.session.id,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:30.000Z",
  goal: "Teach me how to inspect http://localhost:3000 for authorization clues.",
  profileId: "browser-assessment",
  status: "paused",
  policy: {
    maxRuntimeMs: 600_000,
    maxSteps: 18,
    maxReplay: 2,
    maxWorkflowRequests: 4,
    maxCaptureSample: 80,
    allowRawContext: false,
    tutorialMode: true
  },
  mission: createAgentMission(
    "Teach me how to inspect http://localhost:3000 for authorization clues.",
    "http://localhost:3000/dashboard",
    "2026-05-25T00:00:00.000Z"
  ),
  capabilities: createAgentCapabilityState(),
  timeline: [
    {
      id: "step-screenshot",
      createdAt: "2026-05-25T00:00:30.000Z",
      phase: "decision",
      summary: "Inspect the visible authorization boundary",
      note: "Tutorial checkpoint reached. Review the clue before continuing.",
      target: { view: "traffic", evidenceId: "cap-auth", browserUrl: "http://localhost:3000/dashboard" },
      tutorial: {
        stage: "hypothesize",
        title: "Follow the object boundary",
        clue: "The account response exposes a resource identifier that may be checked differently across identities.",
        whyItMatters: "Identifiers become meaningful only when the server's authorization decision changes under a controlled comparison.",
        lookFor: ["The same endpoint under two authorized test identities", "A stable object ID with a changed session context"],
        strongerEvidence: ["Matched captures showing protected content returned to the wrong identity"],
        falsifiers: ["The resource is documented as public", "The response contains only the current user's object"],
        safeNextStep: "Inspect the cited capture, then continue with one identity-controlled comparison.",
        disposition: "learning-clue",
        dispositionRationale: "An exposed identifier is not an authorization bypass without a repeatable access-control difference.",
        evidenceRefs: ["capture:cap-auth"]
      }
    }
  ],
  findings: []
};

const memory: AgentRunMemoryEntry[] = [];
const unsubscribe = () => undefined;

const radarOperator: RadarAiOperatorApi = {
  getLocalContext: async () => localContext,
  getTargets: async () => ["http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*"],
  getAiSettings: async () => settings,
  setAiSettings: async (next) => {
    settings = next;
    return settings;
  },
  connectAi: async () => ({
    settings,
    meta: { presetId: "codex", label: "Codex", apiKeySource: "local" },
    probe: { ok: true, message: "Connected" }
  }),
  probeAiConnection: async () => ({ ok: true, message: "Connected" }),
  loginCursor: async () => ({ ok: true, message: "Linked" }),
  getAiModels: async () => [{ id: "auto", label: "auto" }],
  refreshAiModels: async () => [{ id: "auto", label: "auto" }],
  startAgentRun: async (request) => {
    run = { ...run, goal: request.goal, status: request.tutorialMode ? "paused" : "queued" };
    return run;
  },
  pauseAgentRun: async () => {
    run = { ...run, status: "paused" };
    return run;
  },
  resumeAgentRun: async () => {
    run = { ...run, status: "queued" };
    return run;
  },
  recoverAgentRun: async () => run,
  steerAgentMission: async () => run,
  updateAgentCapabilities: async () => run,
  stopAgentRun: async () => {
    run = { ...run, status: "stopped" };
    return run;
  },
  getAgentRun: async (id) => id === run.id ? run : null,
  listAgentRuns: async () => [run],
  getAgentRunMemory: async () => memory,
  saveAgentRunMemory: async (entry) => {
    memory.unshift(entry);
    return entry;
  },
  deleteAgentRunMemory: async (id) => {
    const index = memory.findIndex((entry) => entry.id === id);
    if (index >= 0) memory.splice(index, 1);
    return { ok: true, memory };
  },
  openAiOperator: async (nextSection = "runs") => {
    section = nextSection;
    return { created: true, visible: true, focused: true, section };
  },
  getWorkspaceContext: async () => ({
    revision: 1,
    mode,
    activeView: "traffic",
    project: { id: localContext.workspace.id, name: localContext.workspace.name },
    session: { id: localContext.session.id, name: localContext.session.name },
    browser: { open: true, url: "http://localhost:3000/dashboard", title: "Local Dashboard" },
    selection: { kind: "capture", id: "cap-auth", label: "POST /api/session" },
    executingRunId: run.id,
    attentionCount: 1
  }),
  dispatchWorkspaceIntent: async () => ({ ok: true }),
  focusWorkspace: async () => ({ ok: true }),
  getAiOperatorWindowState: async () => ({ created: true, visible: true, focused: true, section }),
  getAppMode: async () => mode,
  setAppMode: async (next) => {
    if (next === "manual-first" && (run.status === "queued" || run.status === "running")) {
      run = { ...run, status: "paused" };
    }
    mode = next;
    return mode;
  },
  onWorkspaceContextChanged: () => unsubscribe,
  onAiOperatorWindowState: () => unsubscribe,
  onAppModeChanged: () => unsubscribe,
  onAgentChanged: () => unsubscribe,
  onAiConnectionChanged: () => unsubscribe
};

contextBridge.exposeInMainWorld("radarSurface", "ai-operator");
contextBridge.exposeInMainWorld("radarOperator", radarOperator);
