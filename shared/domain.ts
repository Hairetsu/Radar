export type TlsDetails = {
  protocol: string;
  issuer: string;
  subjectName: string;
  validFrom: number;
  validTo: number;
};

export type InterceptStage = "request" | "response";

export type InterceptResolution = "queued" | "forwarded" | "dropped" | "edited" | "resumed";

export type CaptureInterceptRecord = {
  stage: InterceptStage;
  queuedAt: string;
  resolvedAt?: string;
  resolution: InterceptResolution;
  edited: boolean;
  note?: string;
  ruleHits?: InterceptRuleHit[];
};

export type MatchReplaceStage = InterceptStage;

export type MatchReplaceTarget = "header" | "body";

export type MatchReplaceRule = {
  id: string;
  name: string;
  enabled: boolean;
  stage: MatchReplaceStage;
  target: MatchReplaceTarget;
  match: string;
  replace: string;
  headerName?: string;
  createdAt: string;
  updatedAt: string;
};

export type MatchReplaceHit = {
  ruleId: string;
  name: string;
  stage: MatchReplaceStage;
  target: MatchReplaceTarget;
  detail: string;
};

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
  agentRunId?: string;
  navigationId?: string;
  frameUrl?: string;
  initiator?: string;
  tls?: TlsDetails | null;
  intercept?: CaptureInterceptRecord[];
  rewrites?: MatchReplaceHit[];
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

export type WebSocketDirection = "handshake" | "sent" | "received" | "error" | "closed";

export type WebSocketEvent = {
  id: string;
  requestId: string;
  createdAt: string;
  url: string;
  host: string;
  direction: WebSocketDirection;
  opcode?: number;
  payloadData: string;
  size: number;
  status?: number;
  statusText?: string;
  error?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  initiator?: string;
  allowed: boolean;
};

export type LocalProfile = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalWorkspace = {
  id: string;
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalSession = {
  id: string;
  workspaceId: string;
  name: string;
  startedAt: string;
  updatedAt: string;
};

export type LocalSessionSummary = LocalSession & {
  captureCount: number;
  sslEventCount: number;
};

export type LocalContext = {
  profile: LocalProfile;
  workspace: LocalWorkspace;
  session: LocalSession;
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

export type ProxyProfileId = "radar-browser" | "external-browser" | "cli" | "mobile-device";

export type ProxyProfile = {
  id: ProxyProfileId;
  label: string;
  hint: string;
  notes: string;
  updatedAt: string;
};

export type ReplayDraft = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type InterceptResponseDraft = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

export type InterceptRuleStage = InterceptStage | "both";

export type InterceptRule = {
  id: string;
  name: string;
  enabled: boolean;
  stage: InterceptRuleStage;
  method?: string;
  host?: string;
  path?: string;
  contentType?: string;
  status?: number;
  initiator?: string;
  requestHeader?: string;
  responseHeader?: string;
  body?: string;
  createdAt: string;
  updatedAt: string;
};

export type InterceptRuleHit = {
  ruleId: string;
  name: string;
  reason: string;
};

export type InterceptQueueItem = ReplayDraft & {
  id: string;
  captureId: string;
  stage: InterceptStage;
  queuedAt: string;
  host: string;
  path: string;
  allowed: boolean;
  source: "proxy";
  note: string;
  status?: number;
  statusText?: string;
  ruleHits?: InterceptRuleHit[];
  rewrites?: MatchReplaceHit[];
};

export type InterceptConfig = {
  requestEnabled: boolean;
  responseEnabled: boolean;
};

export type InterceptState = {
  config: InterceptConfig;
  queue: InterceptQueueItem[];
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

export type SavedFilterSurface = "traffic" | "websocket" | "both";

export type SavedFilter = {
  id: string;
  name: string;
  query: string;
  surface: SavedFilterSurface;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceKind = "capture" | "websocket";

export type EvidenceAnnotation = {
  evidenceId: string;
  kind: EvidenceKind;
  tags: string[];
  comment: string;
  updatedAt: string;
};

export type ReplayHistoryEntry = {
  id: string;
  sentAt: string;
  draft: ReplayDraft;
  result: ReplayResult;
};

export type ReplayTab = {
  id: string;
  name: string;
  pinned: boolean;
  draft: ReplayDraft;
  history: ReplayHistoryEntry[];
  environmentId: string;
  createdAt: string;
  updatedAt: string;
};

export type ReplayTabState = {
  tabs: ReplayTab[];
  activeTabId: string;
};

export type ReplayEnvironment = {
  id: string;
  name: string;
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ReplayCollectionItem = {
  id: string;
  name: string;
  draft: ReplayDraft;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ReplayCollection = {
  id: string;
  name: string;
  items: ReplayCollectionItem[];
  createdAt: string;
  updatedAt: string;
};

export type WebSocketReplayDraft = {
  url: string;
  payload: string;
  requestHeaders: Record<string, string>;
  sourceFrameId: string;
  direction: "sent" | "received";
};

export type WebSocketReplayResult = {
  ok: boolean;
  error?: string;
  handshakeStatus?: number;
  responsePayload?: string;
  durationMs: number;
};
