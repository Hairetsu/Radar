import { contextBridge } from "electron";
import type { RadarAiOperatorApi } from "../shared/api/aiOperatorApi.js";
import type { AgentRun, AgentRunMemoryEntry, AgentTimelineEntry, AppMode } from "../shared/agent-types.js";
import { createAgentCapabilityState } from "../shared/agentCapabilities.js";
import { createAgentMission } from "../shared/agentMission.js";
import type { AiSettings } from "../shared/ai-types.js";
import type { AiOperatorSection } from "../shared/windowCoordination.js";

const screenshotVariant = process.argv.includes("--radar-ai-operator-variant=feed") ? "feed" : "tutorial";
const isFeedScreenshot = screenshotVariant === "feed";

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
    name: isFeedScreenshot ? "Authorization Review" : "Guided Authorization Review",
    startedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
};

const tutorialTimeline: AgentTimelineEntry[] = [
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
];

const feedTimeline: AgentTimelineEntry[] = [
  {
    id: "feed-status",
    createdAt: "2026-05-25T00:00:02.000Z",
    phase: "status",
    summary: "Browser assessment started inside saved Scope",
    note: "One sequential operator is collecting evidence from the visible managed browser."
  },
  {
    id: "feed-open-decision",
    createdAt: "2026-05-25T00:00:05.000Z",
    phase: "decision",
    summary: "Open the authenticated dashboard before choosing a test path",
    note: "The dashboard is the smallest visible boundary that can reveal account and session routes.",
    target: { view: "traffic", browserUrl: "http://localhost:3000/dashboard" },
    toolCall: { tool: "openBrowser", input: { url: "http://localhost:3000/dashboard" } }
  },
  {
    id: "feed-open-call",
    createdAt: "2026-05-25T00:00:06.000Z",
    phase: "tool-call",
    summary: "Open the scoped dashboard in Radar Browser",
    target: { browserUrl: "http://localhost:3000/dashboard" },
    toolCall: { tool: "openBrowser", input: { url: "http://localhost:3000/dashboard" } }
  },
  {
    id: "feed-open-result",
    createdAt: "2026-05-25T00:00:12.000Z",
    phase: "tool-result",
    summary: "Dashboard loaded and produced six in-scope requests",
    note: "Navigation settled before the operator continued into page and traffic analysis.",
    target: { view: "traffic", evidenceId: "cap-dashboard", browserUrl: "http://localhost:3000/dashboard" },
    toolResult: {
      tool: "openBrowser",
      ok: true,
      data: {
        open: true,
        url: "http://localhost:3000/dashboard",
        title: "Account Dashboard",
        loading: false,
        engine: "chrome",
        automation: "ready",
        automationPageCount: 1
      }
    }
  },
  {
    id: "feed-text-decision",
    createdAt: "2026-05-25T00:00:18.000Z",
    phase: "decision",
    summary: "Read the visible account controls before interacting",
    note: "Passive page evidence can identify the relevant object and session surfaces without mutating application state.",
    target: { browserUrl: "http://localhost:3000/dashboard" },
    toolCall: { tool: "getPageText", input: {} }
  },
  {
    id: "feed-text-result",
    createdAt: "2026-05-25T00:00:21.000Z",
    phase: "tool-result",
    summary: "Account, billing, and session controls identified",
    note: "The visible page exposes an account identifier and a link to active sessions.",
    target: { browserUrl: "http://localhost:3000/dashboard" },
    toolResult: {
      tool: "getPageText",
      ok: true,
      data: {
        url: "http://localhost:3000/dashboard",
        title: "Account Dashboard",
        text: "Account overview. Active sessions. Billing profile. Sign out."
      }
    }
  },
  {
    id: "feed-captures-result",
    createdAt: "2026-05-25T00:00:27.000Z",
    phase: "tool-result",
    summary: "Six run-attributed captures added to the evidence stream",
    note: "The account and session endpoints are now available for scoped comparison.",
    target: { view: "traffic", evidenceId: "cap-session" },
    toolResult: { tool: "getCaptures", ok: true, data: { captures: [] } }
  },
  {
    id: "feed-cookie-decision",
    createdAt: "2026-05-25T00:00:32.000Z",
    phase: "decision",
    summary: "Assess cookie protections before testing the account boundary",
    note: "The next passive step checks whether the observed session cookie has the expected transport and browser protections.",
    target: { view: "traffic", evidenceId: "cap-session", browserUrl: "http://localhost:3000/dashboard" },
    toolCall: { tool: "analyzeCookieFlags", input: { targetOrigin: "http://localhost:3000" } }
  }
];

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
  updatedAt: isFeedScreenshot ? "2026-05-25T00:00:32.000Z" : "2026-05-25T00:00:30.000Z",
  goal: isFeedScreenshot
    ? "Assess http://localhost:3000 for authorization and session hardening issues."
    : "Teach me how to inspect http://localhost:3000 for authorization clues.",
  profileId: "browser-assessment",
  status: isFeedScreenshot ? "running" : "paused",
  policy: {
    maxRuntimeMs: 600_000,
    maxSteps: 18,
    maxReplay: 2,
    maxWorkflowRequests: 4,
    maxCaptureSample: 80,
    allowRawContext: false,
    tutorialMode: !isFeedScreenshot
  },
  mission: createAgentMission(
    isFeedScreenshot
      ? "Assess http://localhost:3000 for authorization and session hardening issues."
      : "Teach me how to inspect http://localhost:3000 for authorization clues.",
    "http://localhost:3000/dashboard",
    "2026-05-25T00:00:00.000Z"
  ),
  capabilities: createAgentCapabilityState(),
  timeline: isFeedScreenshot ? feedTimeline : tutorialTimeline,
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
