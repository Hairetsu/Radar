export type CapturedRequest = {
  id: string;
  startedAt: string;
  method: string;
  url: string;
  host: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  status: number | null;
  statusText: string;
  mimeType: string;
  type: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  durationMs: number | null;
  encodedDataLength?: number;
  allowed: boolean;
  source: "browser" | "repeater" | "proxy";
  tls?: TlsDetails | null;
};

export type TlsDetails = {
  protocol: string;
  issuer: string;
  subjectName: string;
  validFrom: number;
  validTo: number;
};

export type SslEvent = {
  id: string;
  url: string;
  error: string;
  trusted: boolean;
  subjectName?: string;
  issuerName?: string;
  createdAt: string;
};

export type BrowserState = {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  engine: "none" | "electron" | "chrome";
  remoteDebuggingUrl?: string;
  profileDir?: string;
  executablePath?: string;
  buildId?: string;
  channel?: string;
};

export type ProxyState = {
  running: boolean;
  port: number;
  proxyUrl: string;
  caCertPath: string;
  caKeyPath: string;
  caFingerprint: string;
};

export type ReplayDraft = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type ReplayResult = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
};

export type BurstResult = {
  count: number;
  concurrency: number;
  averageMs: number;
  failures: number;
  results: Array<ReplayResult & { index: number }>;
};

import type {
  AiAuditEntry,
  AiConnectResult,
  AiContextPreview,
  AiRunRequest,
  AiRunResult,
  AiSettings
} from "./ai/types";

export type {
  AiAuditEntry,
  AiContextPreview,
  AiProviderId,
  AiRunRequest,
  AiRunResult,
  AiSettings,
  AiTaskOutput,
  AiTaskType,
  AiBrowserHelperOutput,
  AiCaptureSummaryOutput,
  AiRepeaterDraftItem,
  AiRepeaterDraftsOutput,
  AiReportNotesOutput,
  AiScopeChecklistOutput
} from "./ai/types";

export type RadarApi = {
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
  connectAi: (presetId: import("./ai/types").AiConnectPresetId) => Promise<AiConnectResult>;
  probeAiConnection: (settings: AiSettings) => Promise<import("./ai/types").AiConnectProbe>;
};
