import type {
  BrowserState,
  CapturedRequest,
  ClientOverride,
  InterceptConfig,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  MatchReplaceRule,
  ProxyProfile,
  ProxyProfileId,
  ProxyState,
  ReplayDraft,
  SslEvent,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult
} from "../domain.js";

export type BrowserCaptureApi = {
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
  saveProxyProfile: (payload: {
    id: ProxyProfileId;
    notes: string;
  }) => Promise<ProxyProfile[]>;
  getCaptures: () => Promise<CapturedRequest[]>;
  queryCaptures: (
    query: string
  ) => Promise<{
    ok: boolean;
    error?: string;
    captures: CapturedRequest[];
  }>;
  getSessionCaptures: (
    sessionId: string
  ) => Promise<CapturedRequest[]>;
  deleteCapture: (id: string) => Promise<{ ok: boolean }>;
  clearCaptures: () => Promise<{ ok: boolean }>;
  getInterceptState: () => Promise<InterceptState>;
  setInterceptConfig: (
    config: Partial<InterceptConfig>
  ) => Promise<InterceptState>;
  forwardIntercept: (payload: {
    id: string;
    draft?: ReplayDraft;
    response?: InterceptResponseDraft;
  }) => Promise<InterceptState>;
  dropIntercept: (id: string) => Promise<InterceptState>;
  resumeAllIntercepts: () => Promise<InterceptState>;
  getInterceptRules: () => Promise<InterceptRule[]>;
  setInterceptRules: (
    rules: InterceptRule[]
  ) => Promise<InterceptRule[]>;
  getMatchReplaceRules: () => Promise<MatchReplaceRule[]>;
  setMatchReplaceRules: (
    rules: MatchReplaceRule[]
  ) => Promise<MatchReplaceRule[]>;
  getClientOverrides: () => Promise<ClientOverride[]>;
  setClientOverrides: (
    overrides: ClientOverride[]
  ) => Promise<ClientOverride[]>;
  getSslEvents: () => Promise<SslEvent[]>;
  getWebSocketEvents: () => Promise<WebSocketEvent[]>;
  queryWebSocketEvents: (
    query: string
  ) => Promise<{
    ok: boolean;
    error?: string;
    events: WebSocketEvent[];
  }>;
  clearWebSocketEvents: () => Promise<{ ok: boolean }>;
  sendWebSocketReplay: (
    draft: WebSocketReplayDraft
  ) => Promise<WebSocketReplayResult>;
};
