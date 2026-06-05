import type {
  AiAuditEntry,
  AiConnectPresetId,
  AiConnectProbe,
  AiConnectResult,
  AiContextPreview,
  AiCustomSkill,
  AiModelOption,
  AiRunRequest,
  AiRunResult,
  AiSettings
} from "./ai-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  BurstResult,
  CapturedRequest,
  InterceptConfig,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  MatchReplaceRule,
  ProxyProfile,
  ProxyProfileId,
  ProxyState,
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  ReplayTabState,
  SavedFilter,
  EvidenceAnnotation,
  Finding,
  FindingReport,
  FindingReportOptions,
  InstalledPlugin,
  SslEvent,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult,
  WorkflowDefinition,
  WorkflowRun,
  PluginInstallPreview,
  PluginInstallStatus,
  PluginPermission,
  PluginApiRequest,
  PluginApiResult
} from "./domain.js";
import type { AgentRun, AgentRunRequest } from "./agent-types.js";

export type RadarApi = {
  getLocalContext: () => Promise<LocalContext>;
  listLocalProfiles: () => Promise<LocalProfile[]>;
  createLocalProfile: (name?: string) => Promise<LocalContext>;
  saveLocalProfile: (payload: { id: string; name: string }) => Promise<LocalProfile>;
  loadLocalProfile: (id: string) => Promise<LocalContext>;
  listLocalSessions: (profileId?: string) => Promise<LocalSessionSummary[]>;
  createLocalSession: (name?: string) => Promise<LocalContext>;
  saveLocalSession: (payload: { id: string; name: string }) => Promise<LocalSession>;
  loadLocalSession: (id: string) => Promise<LocalContext>;
  seedDemoProject: () => Promise<LocalContext>;
  openBrowser: (url: string) => Promise<BrowserState>;
  navigateBrowser: (url: string) => Promise<BrowserState>;
  browserBack: () => Promise<BrowserState>;
  browserForward: () => Promise<BrowserState>;
  browserReload: () => Promise<BrowserState>;
  getBrowserState: () => Promise<BrowserState>;
  ensureProxyCa: () => Promise<ProxyState>;
  startProxy: (port?: number) => Promise<ProxyState>;
  stopProxy: () => Promise<ProxyState>;
  getProxyState: () => Promise<ProxyState>;
  getProxyProfiles: () => Promise<ProxyProfile[]>;
  saveProxyProfile: (payload: { id: ProxyProfileId; notes: string }) => Promise<ProxyProfile[]>;
  getCaptures: () => Promise<CapturedRequest[]>;
  queryCaptures: (query: string) => Promise<{ ok: boolean; error?: string; captures: CapturedRequest[] }>;
  getSessionCaptures: (sessionId: string) => Promise<CapturedRequest[]>;
  deleteCapture: (id: string) => Promise<{ ok: boolean }>;
  clearCaptures: () => Promise<{ ok: boolean }>;
  getInterceptState: () => Promise<InterceptState>;
  setInterceptConfig: (config: Partial<InterceptConfig>) => Promise<InterceptState>;
  forwardIntercept: (payload: { id: string; draft?: ReplayDraft; response?: InterceptResponseDraft }) => Promise<InterceptState>;
  dropIntercept: (id: string) => Promise<InterceptState>;
  resumeAllIntercepts: () => Promise<InterceptState>;
  getInterceptRules: () => Promise<InterceptRule[]>;
  setInterceptRules: (rules: InterceptRule[]) => Promise<InterceptRule[]>;
  getMatchReplaceRules: () => Promise<MatchReplaceRule[]>;
  setMatchReplaceRules: (rules: MatchReplaceRule[]) => Promise<MatchReplaceRule[]>;
  getSslEvents: () => Promise<SslEvent[]>;
  getWebSocketEvents: () => Promise<WebSocketEvent[]>;
  queryWebSocketEvents: (query: string) => Promise<{ ok: boolean; error?: string; events: WebSocketEvent[] }>;
  clearWebSocketEvents: () => Promise<{ ok: boolean }>;
  getSavedFilters: () => Promise<SavedFilter[]>;
  setSavedFilters: (filters: SavedFilter[]) => Promise<SavedFilter[]>;
  getReplayTabState: () => Promise<ReplayTabState>;
  setReplayTabState: (state: ReplayTabState) => Promise<ReplayTabState>;
  getReplayEnvironments: () => Promise<ReplayEnvironment[]>;
  setReplayEnvironments: (environments: ReplayEnvironment[]) => Promise<ReplayEnvironment[]>;
  getReplayCollections: () => Promise<ReplayCollection[]>;
  setReplayCollections: (collections: ReplayCollection[]) => Promise<ReplayCollection[]>;
  getAutomatePayloadSets: () => Promise<AutomatePayloadSet[]>;
  setAutomatePayloadSets: (sets: AutomatePayloadSet[]) => Promise<AutomatePayloadSet[]>;
  listAutomateSessions: () => Promise<AutomateSession[]>;
  getAutomateSession: (id: string) => Promise<AutomateSession | null>;
  startAutomateSession: (payload: Partial<AutomateSession>) => Promise<AutomateSession>;
  pauseAutomateSession: (id: string) => Promise<AutomateSession | null>;
  resumeAutomateSession: (id: string) => Promise<AutomateSession | null>;
  stopAutomateSession: (id: string) => Promise<AutomateSession | null>;
  retryAutomateSession: (id: string) => Promise<AutomateSession | null>;
  promoteAutomateResultToRepeater: (payload: { sessionId: string; resultId: string }) => Promise<ReplayTabState>;
  getEvidenceAnnotations: () => Promise<EvidenceAnnotation[]>;
  saveEvidenceAnnotation: (annotation: EvidenceAnnotation) => Promise<EvidenceAnnotation>;
  saveEvidenceAnnotations: (annotations: EvidenceAnnotation[]) => Promise<EvidenceAnnotation[]>;
  getFindings: () => Promise<Finding[]>;
  saveFinding: (finding: Finding) => Promise<Finding>;
  deleteFinding: (id: string) => Promise<{ ok: boolean }>;
  buildFindingReport: (options: Partial<FindingReportOptions>) => Promise<FindingReport>;
  promoteAutomateResultToFinding: (payload: { sessionId: string; resultId: string }) => Promise<Finding>;
  getWorkflows: () => Promise<WorkflowDefinition[]>;
  saveWorkflow: (workflow: WorkflowDefinition) => Promise<WorkflowDefinition>;
  deleteWorkflow: (id: string) => Promise<{ ok: boolean; workflows: WorkflowDefinition[] }>;
  getWorkflowRuns: () => Promise<WorkflowRun[]>;
  runWorkflow: (payload: { workflowId: string; inputs?: Record<string, string>; source?: "manual" | "ai" }) => Promise<WorkflowRun>;
  promoteWorkflowResultToFinding: (payload: { runId: string; resultId: string }) => Promise<Finding>;
  getPlugins: () => Promise<InstalledPlugin[]>;
  previewPluginInstall: (sourcePath: string) => Promise<PluginInstallPreview>;
  installPlugin: (sourcePath: string) => Promise<InstalledPlugin>;
  approvePlugin: (payload: { id: string; permissions: PluginPermission[] }) => Promise<InstalledPlugin>;
  setPluginStatus: (payload: { id: string; status: PluginInstallStatus }) => Promise<InstalledPlugin>;
  removePlugin: (id: string) => Promise<{ ok: boolean; plugins: InstalledPlugin[] }>;
  runPluginApiAction: (request: PluginApiRequest) => Promise<PluginApiResult>;
  getTargets: () => Promise<string[]>;
  setTargets: (targets: string[]) => Promise<string[]>;
  sendReplay: (payload: ReplayDraft | { draft: ReplayDraft; environmentId?: string }) => Promise<ReplayResult>;
  sendWebSocketReplay: (draft: WebSocketReplayDraft) => Promise<WebSocketReplayResult>;
  runBurst: (payload: {
    request: ReplayDraft;
    count: number;
    concurrency: number;
    delayMs: number;
    environmentId?: string;
  }) => Promise<BurstResult>;
  getAiSettings: () => Promise<AiSettings>;
  setAiSettings: (settings: AiSettings) => Promise<AiSettings>;
  previewAiContext: (payload: AiRunRequest) => Promise<AiContextPreview>;
  runAiTask: (payload: AiRunRequest) => Promise<AiRunResult>;
  getAiAudit: () => Promise<AiAuditEntry[]>;
  getAiSkills: () => Promise<AiCustomSkill[]>;
  saveAiSkill: (skill: AiCustomSkill) => Promise<AiCustomSkill[]>;
  deleteAiSkill: (id: string) => Promise<AiCustomSkill[]>;
  connectAi: (presetId: AiConnectPresetId) => Promise<AiConnectResult>;
  probeAiConnection: (settings: AiSettings) => Promise<AiConnectProbe>;
  loginCursor: () => Promise<AiConnectProbe>;
  getAiModels: (provider: AiSettings["provider"]) => Promise<AiModelOption[]>;
  refreshAiModels: (settings: AiSettings) => Promise<AiModelOption[]>;
  startAgentRun: (payload: AgentRunRequest) => Promise<AgentRun>;
  stopAgentRun: (id: string) => Promise<AgentRun | null>;
  getAgentRun: (id: string) => Promise<AgentRun | null>;
  listAgentRuns: () => Promise<AgentRun[]>;
};
