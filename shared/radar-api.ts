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
  ReplayDraft,
  ReplayResult,
  SavedFilter,
  EvidenceAnnotation,
  SslEvent,
  WebSocketEvent
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
  getEvidenceAnnotations: () => Promise<EvidenceAnnotation[]>;
  saveEvidenceAnnotation: (annotation: EvidenceAnnotation) => Promise<EvidenceAnnotation>;
  saveEvidenceAnnotations: (annotations: EvidenceAnnotation[]) => Promise<EvidenceAnnotation[]>;
  getTargets: () => Promise<string[]>;
  setTargets: (targets: string[]) => Promise<string[]>;
  sendReplay: (request: ReplayDraft) => Promise<ReplayResult>;
  runBurst: (payload: {
    request: ReplayDraft;
    count: number;
    concurrency: number;
    delayMs: number;
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
