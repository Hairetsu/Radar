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

export type ClientOverride = {
  id: string;
  name: string;
  enabled: boolean;
  host: string;
  path: string;
  mimeType: string;
  body: string;
  captureId: string;
  relaxApplied: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientOverrideSummary = Omit<ClientOverride, "body"> & {
  bodyChars: number;
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
  actionId?: string;
  identityId?: string;
  activationId?: string;
  sequenceRunId?: string;
  experimentId?: string;
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
  agentRunId?: string;
  navigationId?: string;
  actionId?: string;
  identityId?: string;
  activationId?: string;
  sequenceRunId?: string;
  experimentId?: string;
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
  automation?: "disconnected" | "connecting" | "ready" | "error";
  automationPageCount?: number;
  automationError?: string;
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

export type AutomatePayloadLocation = "url" | "header" | "body";

export type AutomatePayloadPosition = {
  id: string;
  name: string;
  location: AutomatePayloadLocation;
  headerName?: string;
  occurrence: number;
  marker: string;
  preview: string;
};

export type AutomatePayloadAssignments = Record<string, string>;

export type AutomatePayloadSetSource = "inline" | "wordlist";

export type AutomatePayloadSet = {
  id: string;
  name: string;
  source: AutomatePayloadSetSource;
  payloads: string[];
  wordlistPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomateLimits = {
  count: number;
  concurrency: number;
  delayMs: number;
  timeoutMs: number;
};

export type AutomateRunStatus = "ready" | "running" | "paused" | "stopped" | "completed" | "failed";

export type AutomateRuleKind = "match" | "extract";

export type AutomateRuleTarget = "status" | "header" | "body" | "regex" | "redirect" | "length" | "latency";

export type AutomateRule = {
  id: string;
  name: string;
  enabled: boolean;
  kind: AutomateRuleKind;
  target: AutomateRuleTarget;
  pattern?: string;
  headerName?: string;
  status?: number;
  min?: number;
  max?: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomateResultMarker = {
  ruleId: string;
  name: string;
  kind: AutomateRuleKind;
};

export type AutomateExtract = {
  ruleId: string;
  name: string;
  value: string;
};

export type AutomateResult = {
  id: string;
  index: number;
  createdAt: string;
  payload: string;
  request: ReplayDraft;
  ok: boolean;
  status: number;
  statusText: string;
  error?: string;
  redirect?: string;
  length: number;
  latencyMs: number;
  wordCount: number;
  headers: Record<string, string>;
  bodyPreview: string;
  matchedRules: AutomateResultMarker[];
  extracts: AutomateExtract[];
  clusterId?: string;
};

export type AutomateCluster = {
  id: string;
  fingerprint: string;
  statusFamily: string;
  count: number;
  representativeResultId: string;
  averageLength: number;
  averageLatencyMs: number;
  labels: string[];
};

export type AutomateSession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: AutomateRunStatus;
  draft: ReplayDraft;
  environmentId: string;
  payloadSetId?: string;
  payloads: string[];
  positions: AutomatePayloadPosition[];
  limits: AutomateLimits;
  rules: AutomateRule[];
  results: AutomateResult[];
  clusters: AutomateCluster[];
  error?: string;
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

export type ProjectNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedViewTarget =
  | "traffic"
  | "websocket"
  | "intercept"
  | "repeater"
  | "automate"
  | "findings"
  | "workflows"
  | "plugins"
  | "advanced"
  | "sitemap"
  | "scope"
  | "ssl";

export type SavedView = {
  id: string;
  name: string;
  view: SavedViewTarget;
  description: string;
  state: Record<string, string>;
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

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type FindingConfidence = "low" | "medium" | "high";

export type FindingStatus =
  | "draft"
  | "needs-evidence"
  | "reviewed"
  | "accepted-risk"
  | "fixed-pending-retest"
  | "retest-passed"
  | "retest-failed";

export type FindingEvidenceKind =
  | "capture"
  | "websocket"
  | "replay"
  | "automate"
  | "workflow"
  | "ai";

export type FindingEvidenceRef = {
  id: string;
  kind: FindingEvidenceKind;
  label: string;
  createdAt: string;
  metadata: Record<string, string>;
};

export type FindingTemplateId =
  | "auth"
  | "session"
  | "cors"
  | "cache"
  | "headers"
  | "idor"
  | "injection-signal"
  | "access-control"
  | "information-disclosure";

export type Finding = {
  id: string;
  title: string;
  templateId?: FindingTemplateId;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status: FindingStatus;
  component: string;
  affectedAssets: string[];
  evidence: FindingEvidenceRef[];
  reproductionSteps: string;
  impact: string;
  remediation: string;
  notes: string;
  owner: string;
  assignee: string;
  retestResult: string;
  source: "manual" | "ai" | "automate" | "workflow";
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
};

export type FindingReportPreset = "internal-notes" | "client-report" | "raw-technical-appendix";

export type FindingReportOptions = {
  format: "markdown" | "html";
  preset?: FindingReportPreset;
  title?: string;
  includeDrafts: boolean;
  includeAppendix: boolean;
  includeRawEvidence: boolean;
  includeRetestMatrix?: boolean;
  executiveSummary?: string;
  methodology?: string;
  scopeSummary?: string;
  limitations?: string;
  changeLog?: string;
  findingIds?: string[];
};

export type FindingReport = {
  format: FindingReportOptions["format"];
  title: string;
  generatedAt: string;
  findingCount: number;
  body: string;
  validationWarnings?: string[];
};

export type WorkflowMode = "passive" | "active";

export type WorkflowInputType = "text" | "number" | "boolean" | "capture-id";

export type WorkflowStepKind =
  | "security-headers"
  | "cookie-flags"
  | "cors-policy"
  | "cache-control"
  | "metadata-exposure"
  | "active-replay"
  | "browser-open";

export type WorkflowResultLevel = "pass" | "info" | "warn" | "fail";

export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed";

export type WorkflowRunSource = "manual" | "ai";

export type WorkflowScopePolicy = {
  requireInScope: boolean;
  allowActive: boolean;
  maxRequests: number;
  timeoutMs: number;
  delayMs: number;
  maxResults: number;
};

export type WorkflowInput = {
  id: string;
  label: string;
  type: WorkflowInputType;
  required: boolean;
  defaultValue: string;
};

export type WorkflowCondition = {
  inputId: string;
  equals: string;
};

export type WorkflowStep = {
  id: string;
  title: string;
  kind: WorkflowStepKind;
  condition?: WorkflowCondition;
  config: Record<string, string>;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  mode: WorkflowMode;
  builtIn: boolean;
  inputs: WorkflowInput[];
  scope: WorkflowScopePolicy;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowResult = {
  id: string;
  stepId: string;
  stepTitle: string;
  level: WorkflowResultLevel;
  title: string;
  message: string;
  evidence: FindingEvidenceRef[];
  details: Record<string, string>;
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  sessionId: string;
  source: WorkflowRunSource;
  mode: WorkflowMode;
  status: WorkflowRunStatus;
  inputs: Record<string, string>;
  startedAt: string;
  completedAt?: string;
  stepCount: number;
  actionCount: number;
  results: WorkflowResult[];
  error?: string;
};

export type WorkflowStepTemplate = {
  id: string;
  title: string;
  description: string;
  step: WorkflowStep;
};

export type WorkflowGraphNode = {
  id: string;
  title: string;
  kind: WorkflowStepKind;
  active: boolean;
  condition?: WorkflowCondition;
};

export type WorkflowGraphEdge = {
  from: string;
  to: string;
  label: string;
};

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowValidationIssue = {
  severity: "error" | "warning";
  message: string;
  stepId?: string;
};

export type WorkflowDryRun = {
  ok: boolean;
  workflow?: WorkflowDefinition;
  graph: WorkflowGraph;
  issues: WorkflowValidationIssue[];
  activeStepCount: number;
  passiveStepCount: number;
  estimatedRequests: number;
  skippedStepIds: string[];
  runnableStepIds: string[];
};

export type WorkflowDiffEntry = {
  kind: "added" | "removed" | "changed";
  field: string;
  before?: string;
  after?: string;
};

export type WorkflowRevision = {
  id: string;
  workflowId: string;
  workflowName: string;
  savedAt: string;
  summary: string;
  diff: WorkflowDiffEntry[];
  workflow: WorkflowDefinition;
};

export type PluginPermission =
  | "captures:read"
  | "frames:read"
  | "replay:prepare"
  | "replay:send"
  | "files:read"
  | "ai:context"
  | "workflows:read"
  | "workflows:run"
  | "workflows:write"
  | "findings:write"
  | "ui:panel";

export type PluginManifestPanel = {
  id: string;
  title: string;
  entry: string;
};

export type PluginManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  sdkVersion: string;
  minRadarVersion: string;
  entry: string;
  permissions: PluginPermission[];
  panels: PluginManifestPanel[];
};

export type PluginInstallStatus = "pending" | "approved" | "disabled" | "blocked";

export type PluginTrustLevel = "first-party" | "verified-local" | "local" | "untrusted";

export type PluginRuntimeStatus = "idle" | "running" | "ready" | "failed";

export type InstalledPlugin = {
  id: string;
  manifest: PluginManifest;
  sourcePath: string;
  grantedPermissions: PluginPermission[];
  status: PluginInstallStatus;
  trustLevel: PluginTrustLevel;
  compatibilityWarnings: string[];
  warnings: string[];
  installedAt: string;
  updatedAt: string;
};

export type PluginInstallPreview = {
  manifest: PluginManifest;
  sourcePath: string;
  manifestPath: string;
  requestedPermissions: PluginPermission[];
  permissionSummary: string[];
  trustLevel: PluginTrustLevel;
  compatibilityWarnings: string[];
  warnings: string[];
};

export type PluginApiAction =
  | "captures:list"
  | "frames:list"
  | "replay:prepare"
  | "replay:send"
  | "findings:create"
  | "workflows:list"
  | "workflows:save"
  | "workflows:run";

export type PluginApiRequest = {
  pluginId: string;
  action: PluginApiAction;
  input: Record<string, unknown>;
};

export type PluginApiResult = {
  ok: boolean;
  action: PluginApiAction;
  data: unknown;
  error?: string;
};

export type PluginPanelRender = {
  ok: boolean;
  pluginId: string;
  panelId: string;
  title: string;
  html: string;
  sourcePath: string;
  runtimeStatus: PluginRuntimeStatus;
  warnings: string[];
  error?: string;
};

export type PluginAuditEntry = {
  id: string;
  pluginId: string;
  pluginName: string;
  action: PluginApiAction | "panel:render" | "plugin:validate";
  permission?: PluginPermission;
  ok: boolean;
  message: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  createdAt: string;
};

export type PluginDeveloperValidation = {
  ok: boolean;
  sourcePath: string;
  manifest?: PluginManifest;
  trustLevel: PluginTrustLevel;
  warnings: string[];
  errors: string[];
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
