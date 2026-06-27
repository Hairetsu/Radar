import type { AgentRun } from "../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  InstalledPlugin,
  LocalContext,
  ReplayCollection,
  ReplayEnvironment,
  ReplayTabState,
  SavedFilter,
  SslEvent,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../shared/domain.js";
import { PLUGIN_SCHEMA_VERSION, PLUGIN_SDK_VERSION } from "../shared/plugins.js";
import type { LocalStore } from "./localStore.js";

export const DEMO_PROFILE_NAME = "Radar Demo Project";
export const DEMO_SESSION_NAME = "Seeded Walkthrough";

const CREATED_AT = "2026-05-25T14:00:00.000Z";
const UPDATED_AT = "2026-05-25T14:12:00.000Z";
const DEMO_ORIGIN = "https://api.demo.radar.test";
const DEMO_WS = "wss://api.demo.radar.test/realtime";
const DEMO_TARGETS = [DEMO_ORIGIN, "http://localhost:3000"];

const demoDraft = {
  method: "POST",
  url: `${DEMO_ORIGIN}/graphql`,
  headers: {
    Authorization: "{{authToken}}",
    "Content-Type": "application/json",
    Origin: DEMO_ORIGIN
  },
  body: "{\"operationName\":\"ListUsers\",\"query\":\"query ListUsers($role: String) { users(role: $role) { id email role } }\",\"variables\":{\"role\":\"admin\"}}"
};

const demoCaptures: CapturedRequest[] = [
  {
    id: "demo-cap-dashboard",
    startedAt: "2026-05-25T14:00:03.000Z",
    method: "GET",
    url: `${DEMO_ORIGIN}/dashboard`,
    host: "api.demo.radar.test",
    path: "/dashboard",
    requestHeaders: { Accept: "text/html" },
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: {
      "content-type": "text/html",
      "x-powered-by": "DemoStack"
    },
    responseBody: "<html><title>Radar Demo</title><body>Operator dashboard</body></html>",
    durationMs: 42,
    encodedDataLength: 68,
    allowed: true,
    source: "browser",
    tls: {
      protocol: "TLS 1.3",
      issuer: "Radar Demo CA",
      subjectName: "api.demo.radar.test",
      validFrom: 1716600000,
      validTo: 1748136000
    }
  },
  {
    id: "demo-cap-account",
    startedAt: "2026-05-25T14:00:06.000Z",
    method: "GET",
    url: `${DEMO_ORIGIN}/api/me?include=roles`,
    host: "api.demo.radar.test",
    path: "/api/me?include=roles",
    requestHeaders: {
      Authorization: "Bearer demo-operator-token",
      Cookie: "sid=demo-session; theme=specter",
      Accept: "application/json"
    },
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "set-cookie": "refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vIn0.Signature123; Path=/; HttpOnly"
    },
    responseBody:
      "{\"id\":\"u-100\",\"email\":\"operator@demo.radar.test\",\"roles\":[\"admin\"],\"apiKey\":\"AKIAIOSFODNN7EXAMPLE\"}",
    durationMs: 78,
    encodedDataLength: 112,
    allowed: true,
    source: "browser",
    tls: {
      protocol: "TLS 1.3",
      issuer: "Radar Demo CA",
      subjectName: "api.demo.radar.test",
      validFrom: 1716600000,
      validTo: 1748136000
    }
  },
  {
    id: "demo-cap-graphql",
    startedAt: "2026-05-25T14:00:09.000Z",
    method: "POST",
    url: `${DEMO_ORIGIN}/graphql`,
    host: "api.demo.radar.test",
    path: "/graphql",
    requestHeaders: {
      Authorization: "Bearer demo-operator-token",
      "Content-Type": "application/json",
      Origin: DEMO_ORIGIN,
      "X-Forwarded-Host": "audit.demo.radar.test"
    },
    requestBody: demoDraft.body,
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: {
      "content-type": "application/json",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": DEMO_ORIGIN
    },
    responseBody:
      "{\"data\":{\"users\":[]},\"debug\":\"audit.demo.radar.test\",\"token\":\"sk_test_51DemoRadarSecretKey\"}",
    durationMs: 96,
    encodedDataLength: 108,
    allowed: true,
    source: "browser",
    agentRunId: "demo-agent-passive-map",
    navigationId: "demo-nav-graphql",
    frameUrl: `${DEMO_ORIGIN}/dashboard`,
    initiator: "fetch",
    tls: {
      protocol: "TLS 1.3",
      issuer: "Radar Demo CA",
      subjectName: "api.demo.radar.test",
      validFrom: 1716600000,
      validTo: 1748136000
    }
  },
  {
    id: "demo-cap-redirect",
    startedAt: "2026-05-25T14:00:12.000Z",
    method: "GET",
    url: `${DEMO_ORIGIN}/login?next=https%3A%2F%2Fclient.demo.radar.test`,
    host: "api.demo.radar.test",
    path: "/login?next=https%3A%2F%2Fclient.demo.radar.test",
    requestHeaders: { Accept: "text/html" },
    requestBody: "",
    status: 302,
    statusText: "Found",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: {
      location: "https://idp.demo.radar.test/auth",
      "cache-control": "no-store"
    },
    responseBody: "",
    durationMs: 33,
    encodedDataLength: 0,
    allowed: true,
    source: "browser",
    tls: {
      protocol: "TLS 1.3",
      issuer: "Radar Demo CA",
      subjectName: "api.demo.radar.test",
      validFrom: 1716600000,
      validTo: 1748136000
    }
  }
];

const demoWebSocketEvents: WebSocketEvent[] = [
  {
    id: "demo-ws-handshake",
    requestId: "demo-ws-request",
    createdAt: "2026-05-25T14:00:14.000Z",
    url: DEMO_WS,
    host: "api.demo.radar.test",
    direction: "handshake",
    status: 101,
    statusText: "Switching Protocols",
    payloadData: "",
    size: 0,
    requestHeaders: { Upgrade: "websocket", Cookie: "sid=demo-session" },
    responseHeaders: { Connection: "Upgrade" },
    initiator: "dashboard",
    allowed: true
  },
  {
    id: "demo-ws-sent",
    requestId: "demo-ws-request",
    createdAt: "2026-05-25T14:00:15.000Z",
    url: DEMO_WS,
    host: "api.demo.radar.test",
    direction: "sent",
    opcode: 1,
    payloadData: "{\"type\":\"subscribe\",\"channel\":\"admin.audit\",\"cursor\":\"0\"}",
    size: 58,
    requestHeaders: {},
    responseHeaders: {},
    initiator: "dashboard",
    allowed: true
  },
  {
    id: "demo-ws-received",
    requestId: "demo-ws-request",
    createdAt: "2026-05-25T14:00:16.000Z",
    url: DEMO_WS,
    host: "api.demo.radar.test",
    direction: "received",
    opcode: 1,
    payloadData:
      "{\"type\":\"audit\",\"userId\":\"u-100\",\"sessionToken\":\"xoxb-demo-radar-token-1234567890\",\"scope\":\"admin\"}",
    size: 104,
    requestHeaders: {},
    responseHeaders: {},
    initiator: "dashboard",
    allowed: true
  }
];

const demoSslEvents: SslEvent[] = [
  {
    id: "demo-ssl-api",
    url: DEMO_ORIGIN,
    error: "certificate-valid",
    trusted: true,
    subjectName: "api.demo.radar.test",
    issuerName: "Radar Demo CA",
    createdAt: "2026-05-25T14:00:02.000Z"
  }
];

const demoFilters: SavedFilter[] = [
  {
    id: "demo-filter-auth-cache",
    name: "Auth cache risks",
    query: "has:auth cache-control:public",
    surface: "traffic",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  },
  {
    id: "demo-filter-admin-ws",
    name: "Admin frames",
    query: "admin token",
    surface: "websocket",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  }
];

const demoAnnotations: EvidenceAnnotation[] = [
  {
    evidenceId: "demo-cap-account",
    kind: "capture",
    tags: ["demo", "cache", "auth"],
    comment: "Authenticated account JSON is cacheable and contains a secret-shaped value.",
    updatedAt: UPDATED_AT
  },
  {
    evidenceId: "demo-ws-received",
    kind: "websocket",
    tags: ["demo", "token", "websocket"],
    comment: "WebSocket payload includes a token-shaped value for Advanced review.",
    updatedAt: UPDATED_AT
  }
];

const demoReplayEnvironments: ReplayEnvironment[] = [
  {
    id: "demo-env",
    name: "Demo API",
    variables: {
      authToken: "Bearer demo-operator-token",
      baseUrl: DEMO_ORIGIN
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  }
];

const demoReplayCollections: ReplayCollection[] = [
  {
    id: "demo-collection-api",
    name: "Demo API Review",
    items: [
      {
        id: "demo-collection-graphql",
        name: "GraphQL role probe",
        draft: demoDraft,
        tags: ["graphql", "auth"],
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT
      }
    ],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  }
];

const demoReplayTabState: ReplayTabState = {
  activeTabId: "demo-tab-graphql",
  tabs: [
    {
      id: "demo-tab-graphql",
      name: "GraphQL role probe",
      pinned: true,
      draft: demoDraft,
      history: [
        {
          id: "demo-history-graphql",
          sentAt: "2026-05-25T14:01:00.000Z",
          draft: demoDraft,
          result: {
            ok: true,
            status: 200,
            statusText: "OK",
            durationMs: 92,
            headers: { "content-type": "application/json", "cache-control": "public, max-age=600" },
            body: "{\"data\":{\"users\":[]}}",
            bytes: 23
          }
        }
      ],
      environmentId: "demo-env",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT
    }
  ]
};

const demoPayloadSets: AutomatePayloadSet[] = [
  {
    id: "demo-payload-roles",
    name: "Role probes",
    source: "inline",
    payloads: ["user", "admin", "auditor"],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  }
];

const demoAutomateSession: AutomateSession = {
  id: "demo-automate-roles",
  name: "Role parameter sweep",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  status: "completed",
  draft: {
    method: "GET",
    url: `${DEMO_ORIGIN}/api/me?role={{payload:role}}`,
    headers: { Authorization: "{{authToken}}" },
    body: ""
  },
  environmentId: "demo-env",
  payloadSetId: "demo-payload-roles",
  payloads: ["user", "admin", "auditor"],
  positions: [
    {
      id: "demo-position-role",
      name: "role",
      location: "url",
      occurrence: 1,
      marker: "{{payload:role}}",
      preview: "role={{payload:role}}"
    }
  ],
  limits: { count: 3, concurrency: 1, delayMs: 100, timeoutMs: 10000 },
  rules: [
    {
      id: "demo-rule-admin",
      name: "Admin marker",
      enabled: true,
      kind: "match",
      target: "body",
      pattern: "\"admin\"",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT
    }
  ],
  results: [
    {
      id: "demo-automate-result-user",
      index: 1,
      createdAt: "2026-05-25T14:03:00.000Z",
      payload: "user",
      request: { method: "GET", url: `${DEMO_ORIGIN}/api/me?role=user`, headers: {}, body: "" },
      ok: true,
      status: 200,
      statusText: "OK",
      length: 96,
      latencyMs: 61,
      wordCount: 7,
      headers: { "content-type": "application/json" },
      bodyPreview: "{\"role\":\"user\",\"allowed\":true}",
      matchedRules: [],
      extracts: [],
      clusterId: "demo-cluster-2xx"
    },
    {
      id: "demo-automate-result-admin",
      index: 2,
      createdAt: "2026-05-25T14:03:05.000Z",
      payload: "admin",
      request: { method: "GET", url: `${DEMO_ORIGIN}/api/me?role=admin`, headers: {}, body: "" },
      ok: true,
      status: 200,
      statusText: "OK",
      length: 142,
      latencyMs: 88,
      wordCount: 10,
      headers: { "content-type": "application/json" },
      bodyPreview: "{\"role\":\"admin\",\"allowed\":true,\"debug\":true}",
      matchedRules: [{ ruleId: "demo-rule-admin", name: "Admin marker", kind: "match" }],
      extracts: [],
      clusterId: "demo-cluster-admin"
    }
  ],
  clusters: [
    {
      id: "demo-cluster-2xx",
      fingerprint: "2xx:small:json",
      statusFamily: "2xx",
      count: 1,
      representativeResultId: "demo-automate-result-user",
      averageLength: 96,
      averageLatencyMs: 61,
      labels: []
    },
    {
      id: "demo-cluster-admin",
      fingerprint: "2xx:larger:admin",
      statusFamily: "2xx",
      count: 1,
      representativeResultId: "demo-automate-result-admin",
      averageLength: 142,
      averageLatencyMs: 88,
      labels: ["Admin marker"]
    }
  ]
};

const demoWorkflow: WorkflowDefinition = {
  id: "demo-workflow-api-hardening",
  name: "Demo API Hardening Review",
  description: "Passive review of headers, cache behavior, metadata exposure, and CORS behavior for the demo API.",
  mode: "passive",
  builtIn: false,
  inputs: [],
  scope: {
    requireInScope: true,
    allowActive: false,
    maxRequests: 0,
    timeoutMs: 10000,
    delayMs: 0,
    maxResults: 80
  },
  steps: [
    { id: "headers", title: "Security headers", kind: "security-headers", config: {} },
    { id: "cache", title: "Cache behavior", kind: "cache-control", config: {} },
    { id: "cors", title: "CORS behavior", kind: "cors-policy", config: {} },
    { id: "metadata", title: "Metadata exposure", kind: "metadata-exposure", config: {} }
  ],
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT
};

function demoWorkflowRun(sessionId: string): WorkflowRun {
  return {
    id: "demo-workflow-run-api-hardening",
    workflowId: demoWorkflow.id,
    workflowName: demoWorkflow.name,
    sessionId,
    source: "manual",
    mode: "passive",
    status: "completed",
    inputs: {},
    startedAt: "2026-05-25T14:04:00.000Z",
    completedAt: "2026-05-25T14:04:02.000Z",
    stepCount: demoWorkflow.steps.length,
    actionCount: 0,
    results: [
      {
        id: "demo-workflow-result-cache",
        stepId: "cache",
        stepTitle: "Cache behavior",
        level: "warn",
        title: "Authenticated response can be cached",
        message: "The account endpoint returns public cache directives while Authorization is present.",
        evidence: [
          {
            id: "demo-cap-account",
            kind: "capture",
            label: `GET ${DEMO_ORIGIN}/api/me?include=roles`,
            createdAt: "2026-05-25T14:00:06.000Z",
            metadata: { status: "200", host: "api.demo.radar.test", path: "/api/me?include=roles" }
          }
        ],
        details: { cacheControl: "public, max-age=3600" },
        createdAt: "2026-05-25T14:04:01.000Z"
      },
      {
        id: "demo-workflow-result-cors",
        stepId: "cors",
        stepTitle: "CORS behavior",
        level: "warn",
        title: "Reflected CORS origin without Vary",
        message: "The GraphQL endpoint reflects the request Origin but does not return Vary: Origin.",
        evidence: [
          {
            id: "demo-cap-graphql",
            kind: "capture",
            label: `POST ${DEMO_ORIGIN}/graphql`,
            createdAt: "2026-05-25T14:00:09.000Z",
            metadata: { status: "200", host: "api.demo.radar.test", path: "/graphql" }
          }
        ],
        details: { origin: DEMO_ORIGIN, vary: "missing" },
        createdAt: "2026-05-25T14:04:02.000Z"
      }
    ]
  };
}

function demoFindings(): Finding[] {
  return [
    {
      id: "demo-finding-cache",
      title: "Authenticated account response is cacheable",
      templateId: "cache",
      severity: "medium",
      confidence: "high",
      status: "reviewed",
      component: "Accounts API",
      affectedAssets: [`${DEMO_ORIGIN}/api/me`],
      evidence: [
        {
          id: "demo-cap-account",
          kind: "capture",
          label: `GET ${DEMO_ORIGIN}/api/me?include=roles`,
          createdAt: "2026-05-25T14:00:06.000Z",
          metadata: { status: "200", cacheControl: "public, max-age=3600" }
        }
      ],
      reproductionSteps: "Open the demo account endpoint with an Authorization header and inspect Cache-Control.",
      impact: "Shared or browser caches may retain user-specific account data.",
      remediation: "Return Cache-Control: no-store or private for authenticated JSON responses.",
      notes: "Seeded demo finding for report and retest walkthroughs.",
      owner: "demo-api",
      assignee: "platform-security",
      retestResult: "Pending retest after cache policy update.",
      source: "manual",
      createdAt: "2026-05-25T14:05:00.000Z",
      updatedAt: "2026-05-25T14:06:00.000Z",
      reviewedAt: "2026-05-25T14:06:00.000Z"
    },
    {
      id: "demo-finding-secret",
      title: "Secret-shaped values appear in API and WebSocket evidence",
      templateId: "information-disclosure",
      severity: "high",
      confidence: "medium",
      status: "draft",
      component: "GraphQL Gateway",
      affectedAssets: [`${DEMO_ORIGIN}/graphql`, DEMO_WS],
      evidence: [
        {
          id: "demo-cap-graphql",
          kind: "capture",
          label: `POST ${DEMO_ORIGIN}/graphql`,
          createdAt: "2026-05-25T14:00:09.000Z",
          metadata: { status: "200", pattern: "Stripe secret key" }
        },
        {
          id: "demo-ws-received",
          kind: "websocket",
          label: `received ${DEMO_WS}`,
          createdAt: "2026-05-25T14:00:16.000Z",
          metadata: { pattern: "Slack token" }
        }
      ],
      reproductionSteps: "Review the GraphQL response body and the received admin.audit WebSocket frame.",
      impact: "Debug responses and realtime events may expose tokens to clients that can read the channel.",
      remediation: "Remove debug secrets from responses and restrict realtime event payloads to required fields.",
      notes: "Seeded draft finding to exercise Advanced signal review and report export.",
      owner: "platform-security",
      assignee: "appsec",
      retestResult: "",
      source: "ai",
      sourceId: "demo-agent-passive-map",
      createdAt: "2026-05-25T14:07:00.000Z",
      updatedAt: "2026-05-25T14:07:30.000Z"
    }
  ];
}

function demoPlugin(): InstalledPlugin {
  return {
    id: "demo-evidence-panel",
    manifest: {
      schemaVersion: PLUGIN_SCHEMA_VERSION,
      id: "demo-evidence-panel",
      name: "Demo Evidence Panel",
      version: "0.1.0",
      description: "Seeded local plugin that demonstrates approved read-only panel permissions.",
      author: "Radar",
      sdkVersion: PLUGIN_SDK_VERSION,
      minRadarVersion: "0.1.0",
      entry: "dist/index.js",
      permissions: ["captures:read", "frames:read", "findings:write", "ui:panel"],
      panels: [{ id: "demo-evidence", title: "Demo Evidence", entry: "panel.html" }]
    },
    sourcePath: "plugins/examples/demo-evidence-panel",
    grantedPermissions: ["captures:read", "frames:read", "findings:write", "ui:panel"],
    status: "approved",
    trustLevel: "first-party",
    compatibilityWarnings: [],
    warnings: [],
    installedAt: CREATED_AT,
    updatedAt: UPDATED_AT
  };
}

function demoAgentRun(sessionId: string): AgentRun {
  return {
    id: "demo-agent-passive-map",
    sessionId,
    createdAt: "2026-05-25T14:08:00.000Z",
    updatedAt: "2026-05-25T14:09:00.000Z",
    goal: "Passive map the demo API and prepare evidence-backed findings without active testing.",
    profileId: "passive-map",
    status: "completed",
    policy: {
      maxRuntimeMs: 120000,
      maxSteps: 8,
      maxReplay: 0,
      maxWorkflowRequests: 0,
      maxCaptureSample: 25,
      allowRawContext: false
    },
    timeline: [
      {
        id: "demo-agent-step-view",
        createdAt: "2026-05-25T14:08:05.000Z",
        note: "Switched to Advanced to inspect GraphQL, cache, secret, and WebSocket signals.",
        toolCall: { tool: "showView", input: { view: "advanced", reason: "Review seeded Advanced signals" } },
        toolResult: { tool: "showView", ok: true, data: { view: "advanced" } }
      },
      {
        id: "demo-agent-step-query",
        createdAt: "2026-05-25T14:08:20.000Z",
        note: "Prepared a visible traffic query for authenticated cache behavior.",
        toolCall: {
          tool: "prepareTrafficQuery",
          input: { query: "has:auth cache-control:public", reason: "Find authenticated cacheable responses" }
        },
        toolResult: {
          tool: "prepareTrafficQuery",
          ok: true,
          data: { query: "has:auth cache-control:public", reason: "Find authenticated cacheable responses" }
        }
      },
      {
        id: "demo-agent-step-finish",
        createdAt: "2026-05-25T14:09:00.000Z",
        note: "Finished passive review with two draft finding candidates and no replay traffic."
      }
    ],
    findings: [
      {
        id: "demo-agent-finding-cache",
        createdAt: "2026-05-25T14:08:45.000Z",
        title: "Authenticated response can be cached",
        confidence: "high",
        evidenceRefs: ["capture:demo-cap-account"],
        notes: "Authorization was present and Cache-Control allowed public caching.",
        affectedAssets: ["https://api.demo.radar.test/account"],
        reproductionNotes: "Inspect capture:demo-cap-account and confirm Authorization plus public Cache-Control on the response.",
        severityRationale: "Authenticated responses with public caching can expose account data through shared caches.",
        remediation: "Return private/no-store cache directives for authenticated account responses.",
        uncertainties: ["Confirm intended cache policy with application owner."]
      },
      {
        id: "demo-agent-finding-secrets",
        createdAt: "2026-05-25T14:08:50.000Z",
        title: "Secret-shaped values in API evidence",
        confidence: "medium",
        evidenceRefs: ["capture:demo-cap-graphql", "websocket:demo-ws-received"],
        notes: "Advanced analysis found token-shaped values in a GraphQL response and WebSocket payload.",
        affectedAssets: ["https://api.demo.radar.test/graphql", "wss://api.demo.radar.test/realtime"],
        reproductionNotes: "Inspect capture:demo-cap-graphql and websocket:demo-ws-received for token-shaped response values.",
        severityRationale: "Secret-shaped values in API responses can indicate accidental credential exposure.",
        remediation: "Remove secrets from responses and replace them with scoped, non-sensitive identifiers.",
        uncertainties: ["Determine whether values are synthetic, expired, or live secrets."]
      }
    ]
  };
}

export function seedDemoProject(store: LocalStore): LocalContext {
  const existingProfile = store.listProfiles().find((profile) => profile.name === DEMO_PROFILE_NAME);
  const loadedContext = existingProfile
    ? store.loadProfile(existingProfile.id)
    : store.createProfileContext(DEMO_PROFILE_NAME);
  const session = store.updateSession(loadedContext.session.id, DEMO_SESSION_NAME);
  const context = { ...loadedContext, session };

  store.setTargets(context.workspace.id, DEMO_TARGETS);
  store.setSavedFilters(context.workspace.id, demoFilters);
  store.saveEvidenceAnnotations(context.session.id, demoAnnotations);
  store.setReplayEnvironments(context.workspace.id, demoReplayEnvironments);
  store.setReplayCollections(context.workspace.id, demoReplayCollections);
  store.setReplayTabState(context.workspace.id, demoReplayTabState);
  store.setAutomatePayloadSets(context.workspace.id, demoPayloadSets);
  store.upsertAutomateSession(context.session.id, demoAutomateSession);
  store.setWorkflowDefinitions(context.workspace.id, [demoWorkflow]);
  store.upsertWorkflowRun(context.session.id, demoWorkflowRun(context.session.id));
  store.upsertPlugin(context.workspace.id, demoPlugin());

  for (const capture of demoCaptures) {
    store.upsertCapture(context.session.id, capture);
  }
  for (const event of demoWebSocketEvents) {
    store.insertWebSocketEvent(context.session.id, event);
  }
  for (const event of demoSslEvents) {
    store.insertSslEvent(context.session.id, event);
  }
  for (const finding of demoFindings()) {
    store.upsertFinding(context.session.id, finding);
  }
  store.upsertAgentRun(context.session.id, demoAgentRun(context.session.id));

  return context;
}
