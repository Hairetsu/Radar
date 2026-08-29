import { formatHeaders } from "../../lib";
import { defaultReplayTabState, normalizeReplayTabState } from "../../../shared/replayTabs.js";
import { validateWorkflowDraft } from "../../../shared/workflows.js";
import type {
  AgentRun,
  AgentRunMemoryEntry,
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  InstalledPlugin,
  ClientOverride,
  InterceptRule,
  InterceptState,
  MatchReplaceRule,
  PluginAuditEntry,
  ProxyProfile,
  ProxyState,
  ReplayCollection,
  ReplayEnvironment,
  ReplayTabState,
  SslEvent,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../../types";

export interface WorkbenchHydrationPorts {
  scope: {
    replace: (targets: string[]) => void;
  };
  traffic: {
    replace: (captures: CapturedRequest[]) => void;
    resetSelection: () => void;
  };
  sslProxy: {
    replaceEvents: (events: SslEvent[]) => void;
    replaceProfiles: (profiles: ProxyProfile[]) => void;
    replaceState: (state: ProxyState) => void;
  };
  webSocket: {
    replace: (events: WebSocketEvent[]) => void;
    resetReplay: () => void;
  };
  browser: {
    replace: (state: BrowserState) => void;
  };
  intercept: {
    replace: (
      state: InterceptState,
      rules: InterceptRule[],
      matchReplaceRules: MatchReplaceRule[],
      clientOverrides: ClientOverride[]
    ) => void;
    refreshState: (state: InterceptState) => void;
  };
  agents: {
    replace: (runs: AgentRun[], memory: AgentRunMemoryEntry[]) => void;
    select: (runId: string) => void;
  };
  findings: {
    replace: (findings: Finding[], annotations: EvidenceAnnotation[]) => void;
    refresh: (findings: Finding[]) => void;
  };
  workflows: {
    replace: (definitions: WorkflowDefinition[], runs: WorkflowRun[]) => void;
    refreshRuns: (runs: WorkflowRun[]) => void;
  };
  plugins: {
    replace: (plugins: InstalledPlugin[], audit: PluginAuditEntry[]) => void;
  };
  repeater: {
    replace: (
      tabs: ReplayTabState,
      environments: ReplayEnvironment[],
      collections: ReplayCollection[]
    ) => void;
  };
  automate: {
    replace: (payloadSets: AutomatePayloadSet[], sessions: AutomateSession[]) => void;
    refreshSessions: (sessions: AutomateSession[]) => void;
  };
}

export interface WorkbenchSnapshot {
  targets: string[];
  captures: CapturedRequest[];
  sslEvents: SslEvent[];
  webSocketEvents: WebSocketEvent[];
  browserState: BrowserState;
  proxyProfiles: ProxyProfile[];
  proxyState: ProxyState;
  interceptState: InterceptState;
  interceptRules: InterceptRule[];
  matchReplaceRules: MatchReplaceRule[];
  clientOverrides: ClientOverride[];
  agentRuns: AgentRun[];
  agentRunMemory: AgentRunMemoryEntry[];
  evidenceAnnotations: EvidenceAnnotation[];
  findings: Finding[];
  workflows: WorkflowDefinition[];
  workflowRuns: WorkflowRun[];
  plugins: InstalledPlugin[];
  pluginAudit: PluginAuditEntry[];
  replayTabState: ReplayTabState;
  replayEnvironments: ReplayEnvironment[];
  replayCollections: ReplayCollection[];
  automatePayloadSets: AutomatePayloadSet[];
  automateSessions: AutomateSession[];
}

export interface LiveWorkbenchSnapshot {
  captures: CapturedRequest[];
  sslEvents: SslEvent[];
  webSocketEvents: WebSocketEvent[];
  browserState: BrowserState;
  proxyState: ProxyState;
  interceptState: InterceptState;
  agentRuns: AgentRun[];
  agentRunMemory: AgentRunMemoryEntry[];
  findings: Finding[];
  workflowRuns: WorkflowRun[];
  automateSessions: AutomateSession[];
}

async function loadWebSocketEvents() {
  try {
    return await (window.radar?.getWebSocketEvents?.() ?? []);
  } catch {
    return [];
  }
}

async function loadInterceptState() {
  const empty: InterceptState = {
    config: { requestEnabled: false, responseEnabled: false },
    queue: []
  };
  try {
    return await (window.radar?.getInterceptState?.() ?? empty);
  } catch {
    return empty;
  }
}

async function loadInterceptRules() {
  try {
    return await (window.radar?.getInterceptRules?.() ?? []);
  } catch {
    return [];
  }
}

async function loadMatchReplaceRules() {
  try {
    return await (window.radar?.getMatchReplaceRules?.() ?? []);
  } catch {
    return [];
  }
}

async function loadClientOverrides() {
  try {
    return await (window.radar?.getClientOverrides?.() ?? []);
  } catch {
    return [];
  }
}

async function loadProxyProfiles() {
  try {
    return await (window.radar?.getProxyProfiles?.() ?? []);
  } catch {
    return [];
  }
}

export async function loadWorkbenchSnapshot(): Promise<WorkbenchSnapshot | null> {
  if (!window.radar) {
    return null;
  }
  const [
    targets,
    captures,
    sslEvents,
    webSocketEvents,
    browserState,
    proxyProfiles,
    proxyState,
    interceptState,
    interceptRules,
    matchReplaceRules,
    clientOverrides,
    agentRuns,
    agentRunMemory,
    evidenceAnnotations,
    findings,
    workflows,
    workflowRuns,
    plugins,
    pluginAudit,
    replayTabState,
    replayEnvironments,
    replayCollections,
    automatePayloadSets,
    automateSessions
  ] = await Promise.all([
    window.radar.getTargets(),
    window.radar.getCaptures(),
    window.radar.getSslEvents(),
    loadWebSocketEvents(),
    window.radar.getBrowserState(),
    loadProxyProfiles(),
    window.radar.getProxyState(),
    loadInterceptState(),
    loadInterceptRules(),
    loadMatchReplaceRules(),
    loadClientOverrides(),
    window.radar.listAgentRuns(),
    window.radar.getAgentRunMemory?.() ?? [],
    window.radar.getEvidenceAnnotations?.() ?? [],
    window.radar.getFindings?.() ?? [],
    window.radar.getWorkflows?.() ?? [],
    window.radar.getWorkflowRuns?.() ?? [],
    window.radar.getPlugins?.() ?? [],
    window.radar.getPluginAudit?.() ?? [],
    window.radar.getReplayTabState?.() ?? defaultReplayTabState(),
    window.radar.getReplayEnvironments?.() ?? [],
    window.radar.getReplayCollections?.() ?? [],
    window.radar.getAutomatePayloadSets?.() ?? [],
    window.radar.listAutomateSessions?.() ?? []
  ]);
  return {
    targets,
    captures,
    sslEvents,
    webSocketEvents,
    browserState,
    proxyProfiles,
    proxyState,
    interceptState,
    interceptRules,
    matchReplaceRules,
    clientOverrides,
    agentRuns,
    agentRunMemory,
    evidenceAnnotations,
    findings,
    workflows,
    workflowRuns,
    plugins,
    pluginAudit,
    replayTabState,
    replayEnvironments,
    replayCollections,
    automatePayloadSets,
    automateSessions
  };
}

export async function loadLiveWorkbenchSnapshot(): Promise<LiveWorkbenchSnapshot | null> {
  if (!window.radar) {
    return null;
  }
  const [
    captures,
    sslEvents,
    webSocketEvents,
    browserState,
    proxyState,
    interceptState,
    agentRuns,
    agentRunMemory,
    findings,
    workflowRuns,
    automateSessions
  ] = await Promise.all([
    window.radar.getCaptures(),
    window.radar.getSslEvents(),
    loadWebSocketEvents(),
    window.radar.getBrowserState(),
    window.radar.getProxyState(),
    loadInterceptState(),
    window.radar.listAgentRuns(),
    window.radar.getAgentRunMemory?.() ?? [],
    window.radar.getFindings?.() ?? [],
    window.radar.getWorkflowRuns?.() ?? [],
    window.radar.listAutomateSessions?.() ?? []
  ]);
  return {
    captures,
    sslEvents,
    webSocketEvents,
    browserState,
    proxyState,
    interceptState,
    agentRuns,
    agentRunMemory,
    findings,
    workflowRuns,
    automateSessions
  };
}

export function applyWorkbenchSnapshot(
  snapshot: WorkbenchSnapshot,
  ports: WorkbenchHydrationPorts
) {
  ports.scope.replace(snapshot.targets);
  ports.traffic.resetSelection();
  ports.traffic.replace(snapshot.captures);
  ports.sslProxy.replaceEvents(snapshot.sslEvents);
  ports.sslProxy.replaceProfiles(snapshot.proxyProfiles);
  ports.sslProxy.replaceState(snapshot.proxyState);
  ports.webSocket.replace(snapshot.webSocketEvents);
  ports.webSocket.resetReplay();
  ports.browser.replace(snapshot.browserState);
  ports.intercept.replace(
    snapshot.interceptState,
    snapshot.interceptRules,
    snapshot.matchReplaceRules,
    snapshot.clientOverrides
  );
  ports.agents.replace(snapshot.agentRuns, snapshot.agentRunMemory);
  ports.findings.replace(snapshot.findings, snapshot.evidenceAnnotations);
  ports.workflows.replace(snapshot.workflows, snapshot.workflowRuns);
  ports.plugins.replace(snapshot.plugins, snapshot.pluginAudit);
  ports.repeater.replace(
    normalizeReplayTabState(snapshot.replayTabState),
    snapshot.replayEnvironments,
    snapshot.replayCollections
  );
  ports.automate.replace(snapshot.automatePayloadSets, snapshot.automateSessions);
}

export function applyLiveWorkbenchSnapshot(
  snapshot: LiveWorkbenchSnapshot,
  ports: WorkbenchHydrationPorts
) {
  ports.traffic.replace(snapshot.captures);
  ports.sslProxy.replaceEvents(snapshot.sslEvents);
  ports.sslProxy.replaceState(snapshot.proxyState);
  ports.webSocket.replace(snapshot.webSocketEvents);
  ports.browser.replace(snapshot.browserState);
  ports.intercept.refreshState(snapshot.interceptState);
  ports.agents.replace(snapshot.agentRuns, snapshot.agentRunMemory);
  ports.findings.refresh(snapshot.findings);
  ports.workflows.refreshRuns(snapshot.workflowRuns);
  ports.automate.refreshSessions(snapshot.automateSessions);
}

export function hydrateRepeaterDraft(
  tabs: ReplayTabState,
  setHeadersText: (text: string) => void
) {
  const activeTab = tabs.tabs.find((tab) => tab.id === tabs.activeTabId) || tabs.tabs[0];
  setHeadersText(formatHeaders(activeTab?.draft.headers || {}));
}

export function workflowDryRunFor(definitions: WorkflowDefinition[]) {
  return definitions[0] ? validateWorkflowDraft(definitions[0]) : validateWorkflowDraft("");
}
