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
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  ProxyState,
  ReplayDraft,
  ReplayResult,
  SslEvent
} from "./domain.js";

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
  getCaptures: () => Promise<CapturedRequest[]>;
  clearCaptures: () => Promise<{ ok: boolean }>;
  getSslEvents: () => Promise<SslEvent[]>;
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
};
