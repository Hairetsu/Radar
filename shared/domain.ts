export type TlsDetails = {
  protocol: string;
  issuer: string;
  subjectName: string;
  validFrom: number;
  validTo: number;
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
  tls?: TlsDetails | null;
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
