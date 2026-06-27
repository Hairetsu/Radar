import type { CapturedRequest, ReplayDraft, WebSocketEvent, WorkflowDefinition } from "./domain.js";
import { truncateText } from "./text.js";

export type AdvancedEvidenceKind = "capture" | "websocket" | "import";

export type AdvancedEvidenceRef = {
  id: string;
  kind: AdvancedEvidenceKind;
  label: string;
  url: string;
  host: string;
  createdAt: string;
};

export type AdvancedSignalSeverity = "info" | "low" | "medium" | "high";

export type GraphQlOperationType = "query" | "mutation" | "subscription" | "unknown";

export type GraphQlOperation = {
  id: string;
  operationName: string;
  operationType: GraphQlOperationType;
  transport: "http" | "websocket";
  host: string;
  path: string;
  variables: string[];
  batched: boolean;
  introspection: boolean;
  evidence: AdvancedEvidenceRef;
};

export type GraphQlOperationGroup = {
  id: string;
  host: string;
  path: string;
  operationType: GraphQlOperationType;
  operationNames: string[];
  count: number;
  variableNames: string[];
  introspectionCount: number;
  batchedCount: number;
};

export type GraphQlVariableTemplate = {
  id: string;
  operationId: string;
  operationName: string;
  variablesJson: string;
};

export type GraphQlReview = {
  operations: GraphQlOperation[];
  groups: GraphQlOperationGroup[];
  variableTemplates: GraphQlVariableTemplate[];
  hosts: string[];
  operationCount: number;
  queryCount: number;
  mutationCount: number;
  subscriptionCount: number;
  batchedCount: number;
  introspectionCount: number;
};

export type ApiImportSourceType = "openapi" | "postman" | "unknown";

export type ApiImportDraft = {
  id: string;
  sourceType: Exclude<ApiImportSourceType, "unknown">;
  collectionName: string;
  method: string;
  url: string;
  path: string;
  host: string;
  headers: Record<string, string>;
  body: string;
  tags: string[];
};

export type ApiImportResult = {
  ok: boolean;
  sourceType: ApiImportSourceType;
  error: string;
  drafts: ApiImportDraft[];
  replayTemplates: ReplayDraft[];
  sitemapSeeds: string[];
};

export type AuthStateBucket = "anonymous" | "bearer" | "basic" | "cookie" | "mixed";

export type AuthMatrixRow = {
  id: string;
  method: string;
  host: string;
  path: string;
  statuses: Partial<Record<AuthStateBucket, string>>;
  evidenceIds: string[];
  verdict: "observed" | "protected" | "public" | "auth-change" | "ambiguous";
};

export type AuthStateComparison = {
  id: string;
  method: string;
  host: string;
  path: string;
  leftState: AuthStateBucket;
  rightState: AuthStateBucket;
  leftStatus: string;
  rightStatus: string;
  verdict: "same" | "auth-gain" | "auth-loss" | "status-change";
  evidenceIds: string[];
};

export type ParameterLocation =
  | "query"
  | "json"
  | "form"
  | "multipart"
  | "cookie"
  | "header"
  | "graphql"
  | "websocket-json";

export type ParameterFinding = {
  id: string;
  name: string;
  location: ParameterLocation;
  count: number;
  hosts: string[];
  endpoints: string[];
  examples: AdvancedEvidenceRef[];
};

export type SecretDetection = {
  id: string;
  severity: AdvancedSignalSeverity;
  pattern: string;
  location: "response-body" | "response-header" | "websocket-payload";
  preview: string;
  evidence: AdvancedEvidenceRef;
};

export type SensitiveDataRule = {
  id: string;
  name: string;
  severity: AdvancedSignalSeverity;
  pattern: string;
  enabled: boolean;
};

export type HeaderBehaviorSignal = {
  id: string;
  severity: AdvancedSignalSeverity;
  kind: "cache-control" | "cache-poisoning" | "cors-vary" | "host-header" | "redirect";
  title: string;
  message: string;
  evidence: AdvancedEvidenceRef;
  details: Record<string, string>;
};

export type ProxyGuidance = {
  id: "mobile-device" | "thick-client" | "cli";
  title: string;
  summary: string;
  checklist: string[];
};

export type AdvancedTestingSummary = {
  graphql: GraphQlReview;
  apiImport: ApiImportResult;
  authMatrix: AuthMatrixRow[];
  authComparisons: AuthStateComparison[];
  parameters: ParameterFinding[];
  secretRules: SensitiveDataRule[];
  secrets: SecretDetection[];
  headerSignals: HeaderBehaviorSignal[];
  proxyGuidance: ProxyGuidance[];
};

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
const MAX_OPERATIONS = 120;
const MAX_PARAMETERS = 160;
const MAX_SIGNALS = 120;
const MAX_IMPORT_DRAFTS = 120;

export const ADVANCED_PROXY_GUIDANCE: ProxyGuidance[] = [
  {
    id: "mobile-device",
    title: "Mobile Device Proxy",
    summary: "Route a test device through Radar's proxy without changing Radar's local-first data model.",
    checklist: [
      "Engage the proxy in SSL.",
      "Put the device and Radar host on the same trusted network.",
      "Set the device HTTP and HTTPS proxy to Radar's proxy address.",
      "Install and trust Radar's CA certificate only on the test device profile.",
      "Add the target origin to Scope before browsing."
    ]
  },
  {
    id: "thick-client",
    title: "Thick Client Proxy",
    summary: "Use Radar as an explicit proxy for authorized desktop clients and SDKs.",
    checklist: [
      "Start with explicit proxy settings or documented environment variables.",
      "Capture only the intended target origin in Scope.",
      "Prefer a disposable client profile or test account.",
      "Document certificate pinning or proxy-bypass behavior in the SSL notes.",
      "Avoid invisible proxy experiments until explicit proxy capture is understood."
    ]
  },
  {
    id: "cli",
    title: "CLI And API Tooling",
    summary: "Route curl, SDKs, and integration tools through Radar for repeatable API evidence.",
    checklist: [
      "Set HTTPS_PROXY and HTTP_PROXY to Radar's proxy URL.",
      "Point the tool at Radar's CA certificate when TLS verification is enabled.",
      "Keep credentials in the tool or environment, not in Radar notes.",
      "Save replay templates only after reviewing imported headers.",
      "Clear proxy variables after the test window closes."
    ]
  }
];

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanLine(value: unknown, fallback = "") {
  return String(value || fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanText(value: unknown, limit = 4000) {
  return truncateText(String(value || "").trim(), limit);
}

function cleanId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "item";
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function headerValue(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
  return entry ? entry[1] : "";
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function pathFromUrl(value: string) {
  const parsed = safeUrl(value);
  return parsed ? parsed.pathname || "/" : value.split("?")[0] || "/";
}

function hostFromUrl(value: string) {
  const parsed = safeUrl(value);
  return parsed ? parsed.host : "";
}

function evidenceFromCapture(capture: CapturedRequest): AdvancedEvidenceRef {
  return {
    id: capture.id,
    kind: "capture",
    label: `${capture.method} ${capture.url}`,
    url: capture.url,
    host: capture.host,
    createdAt: capture.startedAt
  };
}

function evidenceFromWebSocket(event: WebSocketEvent): AdvancedEvidenceRef {
  return {
    id: event.id,
    kind: "websocket",
    label: `${event.direction} ${event.url}`,
    url: event.url,
    host: event.host,
    createdAt: event.createdAt
  };
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function graphqlPayloads(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(objectValue).filter((entry) => Object.keys(entry).length > 0);
  }
  const object = objectValue(value);
  return Object.keys(object).length > 0 ? [object] : [];
}

function graphqlOperationType(query: string): GraphQlOperationType {
  const match = /\b(query|mutation|subscription)\b/i.exec(query);
  if (!match) {
    return "unknown";
  }
  const type = match[1].toLowerCase();
  return type === "query" || type === "mutation" || type === "subscription" ? type : "unknown";
}

function graphqlOperationName(query: string, explicit: unknown, index: number) {
  const provided = cleanLine(explicit);
  if (provided) {
    return provided;
  }
  const match = /\b(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(query);
  return match ? match[1] : `operation-${index + 1}`;
}

function graphqlVariables(value: unknown) {
  const variables = objectValue(value);
  return uniqueSorted(Object.keys(variables));
}

function isGraphQlLikeCapture(capture: CapturedRequest) {
  const contentType = headerValue(capture.requestHeaders, "content-type").toLowerCase();
  return /graphql/i.test(capture.url) || contentType.includes("graphql") || /"query"\s*:/.test(capture.requestBody);
}

function graphqlOperationsFromHttpCapture(capture: CapturedRequest, indexOffset: number) {
  if (!isGraphQlLikeCapture(capture)) {
    return [];
  }
  const parsed = tryJson(capture.requestBody);
  const payloads = graphqlPayloads(parsed);
  return payloads
    .map((payload, index): GraphQlOperation | null => {
      const query = cleanText(payload.query, 8000);
      if (!query) {
        return null;
      }
      const operationName = graphqlOperationName(query, payload.operationName, indexOffset + index);
      return {
        id: `graphql-${capture.id}-${index}`,
        operationName,
        operationType: graphqlOperationType(query),
        transport: "http",
        host: capture.host,
        path: capture.path,
        variables: graphqlVariables(payload.variables),
        batched: payloads.length > 1,
        introspection: /__(schema|type)\b/i.test(query) || /"__(schema|type)"/i.test(capture.responseBody),
        evidence: evidenceFromCapture(capture)
      };
    })
    .filter((operation): operation is GraphQlOperation => Boolean(operation));
}

function graphqlOperationsFromFrame(event: WebSocketEvent, indexOffset: number) {
  const parsed = tryJson(event.payloadData);
  const payloads = graphqlPayloads(parsed);
  const nestedPayloads = payloads.flatMap((payload) => {
    const nested = objectValue(payload.payload);
    return Object.keys(nested).length > 0 ? [nested] : [payload];
  });
  return nestedPayloads
    .map((payload, index): GraphQlOperation | null => {
      const query = cleanText(payload.query, 8000);
      if (!query) {
        return null;
      }
      const operationName = graphqlOperationName(query, payload.operationName, indexOffset + index);
      return {
        id: `graphql-${event.id}-${index}`,
        operationName,
        operationType: graphqlOperationType(query),
        transport: "websocket",
        host: event.host,
        path: pathFromUrl(event.url),
        variables: graphqlVariables(payload.variables),
        batched: nestedPayloads.length > 1,
        introspection: /__(schema|type)\b/i.test(query),
        evidence: evidenceFromWebSocket(event)
      };
    })
    .filter((operation): operation is GraphQlOperation => Boolean(operation));
}

export function groupGraphQlOperations(operations: GraphQlOperation[]): GraphQlOperationGroup[] {
  const groups = new Map<string, GraphQlOperationGroup>();
  for (const operation of operations) {
    const key = `${operation.host}:${operation.path}:${operation.operationType}`;
    const existing = groups.get(key) || {
      id: cleanId(key),
      host: operation.host,
      path: operation.path,
      operationType: operation.operationType,
      operationNames: [],
      count: 0,
      variableNames: [],
      introspectionCount: 0,
      batchedCount: 0
    };
    existing.operationNames = uniqueSorted([...existing.operationNames, operation.operationName]).slice(0, 24);
    existing.variableNames = uniqueSorted([...existing.variableNames, ...operation.variables]).slice(0, 40);
    existing.count += 1;
    existing.introspectionCount += operation.introspection ? 1 : 0;
    existing.batchedCount += operation.batched ? 1 : 0;
    groups.set(key, existing);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.count - left.count || left.host.localeCompare(right.host) || left.path.localeCompare(right.path)
  );
}

export function buildGraphQlVariableTemplates(operations: GraphQlOperation[]): GraphQlVariableTemplate[] {
  return operations
    .filter((operation) => operation.variables.length > 0)
    .map((operation) => ({
      id: cleanId(`variables-${operation.id}`),
      operationId: operation.id,
      operationName: operation.operationName,
      variablesJson: JSON.stringify(
        Object.fromEntries(operation.variables.map((variable) => [variable, `{{${variable}}}`])),
        null,
        2
      )
    }))
    .slice(0, MAX_OPERATIONS);
}

export function analyzeGraphQl(captures: CapturedRequest[], frames: WebSocketEvent[] = []): GraphQlReview {
  const operations = [
    ...captures.flatMap((capture, index) => graphqlOperationsFromHttpCapture(capture, index)),
    ...frames.flatMap((event, index) => graphqlOperationsFromFrame(event, captures.length + index))
  ].slice(0, MAX_OPERATIONS);
  return {
    operations,
    groups: groupGraphQlOperations(operations),
    variableTemplates: buildGraphQlVariableTemplates(operations),
    hosts: uniqueSorted(operations.map((operation) => operation.host)),
    operationCount: operations.length,
    queryCount: operations.filter((operation) => operation.operationType === "query").length,
    mutationCount: operations.filter((operation) => operation.operationType === "mutation").length,
    subscriptionCount: operations.filter((operation) => operation.operationType === "subscription").length,
    batchedCount: operations.filter((operation) => operation.batched).length,
    introspectionCount: operations.filter((operation) => operation.introspection).length
  };
}

function joinBaseAndPath(base: string, path: string) {
  if (!base) {
    return path;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function hostFromImportUrl(url: string) {
  return hostFromUrl(url) || hostFromUrl(`https://${url}`) || "";
}

function importDraft(input: {
  id: string;
  sourceType: Exclude<ApiImportSourceType, "unknown">;
  collectionName: string;
  method: string;
  url: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  tags?: string[];
}): ApiImportDraft {
  return {
    id: cleanId(input.id),
    sourceType: input.sourceType,
    collectionName: cleanLine(input.collectionName, "Imported API"),
    method: cleanLine(input.method, "GET").toUpperCase(),
    url: cleanLine(input.url),
    path: cleanLine(input.path, "/"),
    host: hostFromImportUrl(input.url),
    headers: input.headers || {},
    body: cleanText(input.body, 8000),
    tags: uniqueSorted(input.tags || [])
  };
}

function openApiBaseUrl(input: Record<string, unknown>, fallbackBaseUrl: string) {
  const servers = arrayValue(input.servers).map(objectValue);
  const serverUrl = cleanLine(servers[0]?.url);
  if (serverUrl) {
    return serverUrl;
  }
  const host = cleanLine(input.host);
  const basePath = cleanLine(input.basePath);
  if (host) {
    const schemes = arrayValue(input.schemes).map((entry) => cleanLine(entry)).filter(Boolean);
    return `${schemes[0] || "https"}://${host}${basePath}`;
  }
  return fallbackBaseUrl;
}

function openApiDrafts(input: Record<string, unknown>, fallbackBaseUrl: string) {
  const paths = objectValue(input.paths);
  const baseUrl = openApiBaseUrl(input, fallbackBaseUrl);
  const drafts: ApiImportDraft[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    const operations = objectValue(pathItem);
    for (const [method, operationValue] of Object.entries(operations)) {
      if (!HTTP_METHODS.includes(method.toLowerCase() as (typeof HTTP_METHODS)[number])) {
        continue;
      }
      const operation = objectValue(operationValue);
      const tags = arrayValue(operation.tags).map((entry) => cleanLine(entry)).filter(Boolean);
      const hasBody = Boolean(objectValue(operation.requestBody).content);
      drafts.push(
        importDraft({
          id: `openapi-${method}-${path}`,
          sourceType: "openapi",
          collectionName: cleanLine(input.info && objectValue(input.info).title, "OpenAPI Import"),
          method,
          url: joinBaseAndPath(baseUrl, path),
          path,
          headers: hasBody ? { "Content-Type": "application/json" } : {},
          body: hasBody ? "{}" : "",
          tags: [cleanLine(operation.operationId), ...tags].filter(Boolean)
        })
      );
      if (drafts.length >= MAX_IMPORT_DRAFTS) {
        return drafts;
      }
    }
  }
  return drafts;
}

function normalizePostmanUrl(value: unknown) {
  if (typeof value === "string") {
    return cleanLine(value);
  }
  const input = objectValue(value);
  const raw = cleanLine(input.raw);
  if (raw) {
    return raw;
  }
  const host = arrayValue(input.host).map((entry) => cleanLine(entry)).filter(Boolean).join(".");
  const path = arrayValue(input.path).map((entry) => cleanLine(entry)).filter(Boolean).join("/");
  const protocol = cleanLine(input.protocol, "https");
  return host ? `${protocol}://${host}/${path}` : `/${path}`;
}

function normalizePostmanHeaders(value: unknown) {
  const headers: Record<string, string> = {};
  for (const item of arrayValue(value).map(objectValue)) {
    const key = cleanLine(item.key);
    const headerValueText = cleanLine(item.value);
    if (key && headerValueText) {
      headers[key] = headerValueText;
    }
  }
  return headers;
}

function postmanDrafts(input: Record<string, unknown>) {
  const collectionName = cleanLine(objectValue(input.info).name, "Postman Import");
  const drafts: ApiImportDraft[] = [];
  const walk = (items: unknown[], trail: string[]) => {
    for (const item of items.map(objectValue)) {
      if (drafts.length >= MAX_IMPORT_DRAFTS) {
        return;
      }
      const request = objectValue(item.request);
      const children = arrayValue(item.item);
      if (Object.keys(request).length > 0) {
        const url = normalizePostmanUrl(request.url);
        const body = objectValue(request.body);
        drafts.push(
          importDraft({
            id: `postman-${trail.join("-")}-${cleanLine(item.name, "request")}-${drafts.length}`,
            sourceType: "postman",
            collectionName,
            method: cleanLine(request.method, "GET"),
            url,
            path: pathFromUrl(url),
            headers: normalizePostmanHeaders(request.header),
            body: cleanText(body.raw, 8000),
            tags: [...trail, cleanLine(item.name)].filter(Boolean)
          })
        );
      }
      if (children.length > 0) {
        walk(children, [...trail, cleanLine(item.name)].filter(Boolean));
      }
    }
  };
  walk(arrayValue(input.item), []);
  return drafts;
}

export function parseApiImport(source: string, fallbackBaseUrl = ""): ApiImportResult {
  const text = source.trim();
  if (!text) {
    return { ok: true, sourceType: "unknown", error: "", drafts: [], replayTemplates: [], sitemapSeeds: [] };
  }
  const parsed = tryJson(text);
  const input = objectValue(parsed);
  if (Object.keys(input).length === 0) {
    return { ok: false, sourceType: "unknown", error: "Import JSON could not be parsed.", drafts: [], replayTemplates: [], sitemapSeeds: [] };
  }
  const sourceType: ApiImportSourceType =
    input.openapi || input.swagger ? "openapi" : objectValue(input.info).schema || input.item ? "postman" : "unknown";
  const drafts =
    sourceType === "openapi"
      ? openApiDrafts(input, fallbackBaseUrl)
      : sourceType === "postman"
        ? postmanDrafts(input)
        : [];
  if (sourceType === "unknown") {
    return { ok: false, sourceType, error: "Import JSON is not a supported OpenAPI or Postman document.", drafts: [], replayTemplates: [], sitemapSeeds: [] };
  }
  return {
    ok: true,
    sourceType,
    error: drafts.length === 0 ? "No request operations were found in the import document." : "",
    drafts,
    replayTemplates: drafts.map((draft) => ({
      method: draft.method,
      url: draft.url,
      headers: draft.headers,
      body: draft.body
    })),
    sitemapSeeds: uniqueSorted(drafts.map((draft) => `${draft.method} ${draft.path}`))
  };
}

function statusFamily(status: number | null) {
  if (!status) {
    return "pending";
  }
  return `${Math.floor(status / 100)}xx`;
}

function authState(capture: CapturedRequest): AuthStateBucket {
  const authorization = headerValue(capture.requestHeaders, "authorization").toLowerCase();
  const cookie = headerValue(capture.requestHeaders, "cookie");
  if (authorization.startsWith("bearer ") && cookie) {
    return "mixed";
  }
  if (authorization.startsWith("bearer ")) {
    return "bearer";
  }
  if (authorization.startsWith("basic ")) {
    return "basic";
  }
  if (authorization || cookie) {
    return cookie ? "cookie" : "mixed";
  }
  return "anonymous";
}

function endpointKey(capture: CapturedRequest) {
  const normalizedPath = pathFromUrl(capture.url)
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${capture.method.toUpperCase()} ${capture.host} ${normalizedPath}`;
}

function authMatrixVerdict(statuses: Partial<Record<AuthStateBucket, string>>): AuthMatrixRow["verdict"] {
  const anonymous = statuses.anonymous || "";
  const authenticated = [statuses.bearer, statuses.basic, statuses.cookie, statuses.mixed].filter(Boolean);
  const isSuccess = (status: string) => /^2\d\d/.test(status) || /^2xx/.test(status);
  const isDenied = (status: string) => /^(401|403|4xx)/.test(status);
  if (!anonymous || authenticated.length === 0) {
    return "observed";
  }
  if (isSuccess(anonymous) && authenticated.some((status) => isSuccess(status || ""))) {
    return "public";
  }
  if (isDenied(anonymous) && authenticated.some((status) => isSuccess(status || ""))) {
    return "protected";
  }
  if (authenticated.some((status) => status !== anonymous)) {
    return "auth-change";
  }
  return "ambiguous";
}

export function buildAuthMatrix(captures: CapturedRequest[]): AuthMatrixRow[] {
  const rows = new Map<string, AuthMatrixRow>();
  for (const capture of captures) {
    const key = endpointKey(capture);
    const existing = rows.get(key);
    const path = pathFromUrl(capture.url);
    const state = authState(capture);
    const status = capture.status ? String(capture.status) : statusFamily(capture.status);
    const row =
      existing ||
      {
        id: cleanId(key),
        method: capture.method.toUpperCase(),
        host: capture.host,
        path,
        statuses: {},
        evidenceIds: [],
        verdict: "observed" as const
      };
    row.statuses[state] = row.statuses[state] ? `${row.statuses[state]},${status}` : status;
    row.evidenceIds = uniqueSorted([...row.evidenceIds, capture.id]);
    row.verdict = authMatrixVerdict(row.statuses);
    rows.set(key, row);
  }
  return Array.from(rows.values())
    .sort((left, right) => left.host.localeCompare(right.host) || left.path.localeCompare(right.path) || left.method.localeCompare(right.method))
    .slice(0, MAX_SIGNALS);
}

function firstStatus(value: string | undefined) {
  return String(value || "").split(",")[0] || "";
}

function successfulStatus(value: string) {
  return /^2\d\d/.test(value) || /^2xx/.test(value);
}

function deniedStatus(value: string) {
  return /^(401|403|4xx)/.test(value);
}

export function compareAuthMatrixRows(rows: AuthMatrixRow[]): AuthStateComparison[] {
  const comparisons: AuthStateComparison[] = [];
  const states: AuthStateBucket[] = ["anonymous", "bearer", "basic", "cookie", "mixed"];
  for (const row of rows) {
    for (let leftIndex = 0; leftIndex < states.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < states.length; rightIndex += 1) {
        const leftState = states[leftIndex];
        const rightState = states[rightIndex];
        const leftStatus = firstStatus(row.statuses[leftState]);
        const rightStatus = firstStatus(row.statuses[rightState]);
        if (!leftStatus || !rightStatus) {
          continue;
        }
        const verdict: AuthStateComparison["verdict"] =
          leftStatus === rightStatus
            ? "same"
            : deniedStatus(leftStatus) && successfulStatus(rightStatus)
              ? "auth-gain"
              : successfulStatus(leftStatus) && deniedStatus(rightStatus)
                ? "auth-loss"
                : "status-change";
        comparisons.push({
          id: cleanId(`${row.id}-${leftState}-${rightState}`),
          method: row.method,
          host: row.host,
          path: row.path,
          leftState,
          rightState,
          leftStatus,
          rightStatus,
          verdict,
          evidenceIds: row.evidenceIds
        });
      }
    }
  }
  return comparisons.slice(0, MAX_SIGNALS);
}

function collectJsonPaths(value: unknown, prefix = "", depth = 0): string[] {
  if (depth > 3 || !value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJsonPaths(item, prefix, depth + 1));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return [next, ...collectJsonPaths(entry, next, depth + 1)];
  });
}

function formFields(body: string) {
  return body
    .split("&")
    .map((pair) => decodeURIComponent(pair.split("=")[0] || "").trim())
    .filter(Boolean);
}

function multipartFields(body: string) {
  return Array.from(body.matchAll(/name=["']([^"']+)["']/gi)).map((match) => cleanLine(match[1])).filter(Boolean);
}

function cookieNames(value: string) {
  return value
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim())
    .filter(Boolean);
}

function addParameter(
  map: Map<string, ParameterFinding>,
  input: { name: string; location: ParameterLocation; host: string; endpoint: string; evidence: AdvancedEvidenceRef }
) {
  const name = cleanLine(input.name);
  if (!name) {
    return;
  }
  const key = `${input.location}:${name}`;
  const existing = map.get(key) || {
    id: cleanId(key),
    name,
    location: input.location,
    count: 0,
    hosts: [],
    endpoints: [],
    examples: []
  };
  existing.count += 1;
  existing.hosts = uniqueSorted([...existing.hosts, input.host]).slice(0, 12);
  existing.endpoints = uniqueSorted([...existing.endpoints, input.endpoint]).slice(0, 24);
  if (!existing.examples.some((example) => example.id === input.evidence.id)) {
    existing.examples = [...existing.examples, input.evidence].slice(0, 5);
  }
  map.set(key, existing);
}

export function discoverParameters(captures: CapturedRequest[], frames: WebSocketEvent[] = []): ParameterFinding[] {
  const parameters = new Map<string, ParameterFinding>();
  for (const capture of captures) {
    const evidence = evidenceFromCapture(capture);
    const url = safeUrl(capture.url);
    const endpoint = `${capture.method.toUpperCase()} ${pathFromUrl(capture.url)}`;
    if (url) {
      for (const name of url.searchParams.keys()) {
        addParameter(parameters, { name, location: "query", host: capture.host, endpoint, evidence });
      }
    }
    for (const [name] of Object.entries(capture.requestHeaders)) {
      if (!["accept", "content-type", "user-agent", "host"].includes(name.toLowerCase())) {
        addParameter(parameters, { name, location: "header", host: capture.host, endpoint, evidence });
      }
    }
    for (const name of cookieNames(headerValue(capture.requestHeaders, "cookie"))) {
      addParameter(parameters, { name, location: "cookie", host: capture.host, endpoint, evidence });
    }
    const contentType = headerValue(capture.requestHeaders, "content-type").toLowerCase();
    const parsed = tryJson(capture.requestBody);
    for (const name of collectJsonPaths(parsed)) {
      addParameter(parameters, { name, location: "json", host: capture.host, endpoint, evidence });
    }
    if (contentType.includes("x-www-form-urlencoded")) {
      for (const name of formFields(capture.requestBody)) {
        addParameter(parameters, { name, location: "form", host: capture.host, endpoint, evidence });
      }
    }
    if (contentType.includes("multipart/form-data")) {
      for (const name of multipartFields(capture.requestBody)) {
        addParameter(parameters, { name, location: "multipart", host: capture.host, endpoint, evidence });
      }
    }
    for (const operation of graphqlOperationsFromHttpCapture(capture, 0)) {
      for (const name of operation.variables) {
        addParameter(parameters, { name, location: "graphql", host: capture.host, endpoint, evidence });
      }
    }
  }
  for (const event of frames) {
    const evidence = evidenceFromWebSocket(event);
    const parsed = tryJson(event.payloadData);
    for (const name of collectJsonPaths(parsed)) {
      addParameter(parameters, {
        name,
        location: "websocket-json",
        host: event.host,
        endpoint: `${event.direction} ${pathFromUrl(event.url)}`,
        evidence
      });
    }
  }
  return Array.from(parameters.values())
    .sort((left, right) => right.count - left.count || left.location.localeCompare(right.location) || left.name.localeCompare(right.name))
    .slice(0, MAX_PARAMETERS);
}

export const DEFAULT_SENSITIVE_DATA_RULES: SensitiveDataRule[] = [
  {
    id: "private-key",
    name: "Private key",
    severity: "high",
    pattern: "-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    enabled: true
  },
  {
    id: "aws-access-key",
    name: "AWS access key",
    severity: "high",
    pattern: "\\bAKIA[0-9A-Z]{16}\\b",
    enabled: true
  },
  {
    id: "jwt",
    name: "JWT",
    severity: "medium",
    pattern: "\\beyJ[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{8,}\\b",
    enabled: true
  },
  {
    id: "stripe-secret-key",
    name: "Stripe secret key",
    severity: "high",
    pattern: "\\bsk_(?:live|test)_[A-Za-z0-9]{16,}\\b",
    enabled: true
  },
  {
    id: "slack-token",
    name: "Slack token",
    severity: "high",
    pattern: "\\bxox[baprs]-[A-Za-z0-9-]{16,}\\b",
    enabled: true
  },
  {
    id: "secret-assignment",
    name: "Secret assignment",
    severity: "medium",
    pattern: "\\b(?:api[_-]?key|secret|token|password)[\"'\\s:=]+[A-Za-z0-9_./+:-]{12,}",
    enabled: true
  }
];

function maskSecret(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 14) {
    return "[masked]";
  }
  return `${compact.slice(0, 6)}...${compact.slice(-4)}`;
}

function detectSecretsInText(input: {
  text: string;
  location: SecretDetection["location"];
  evidence: AdvancedEvidenceRef;
  seed: string;
  rules: SensitiveDataRule[];
}) {
  const findings: SecretDetection[] = [];
  for (const rule of input.rules.filter((item) => item.enabled)) {
    const regex = new RegExp(rule.pattern, "gi");
    for (const match of input.text.matchAll(regex)) {
      const value = match[0] || "";
      findings.push({
        id: cleanId(`${input.seed}-${rule.id}-${findings.length}`),
        severity: rule.severity,
        pattern: rule.name,
        location: input.location,
        preview: maskSecret(value),
        evidence: input.evidence
      });
      if (findings.length >= 6) {
        break;
      }
    }
  }
  return findings;
}

export function detectSensitiveData(captures: CapturedRequest[], frames: WebSocketEvent[] = []): SecretDetection[] {
  const findings: SecretDetection[] = [];
  const rules = DEFAULT_SENSITIVE_DATA_RULES;
  for (const capture of captures) {
    const evidence = evidenceFromCapture(capture);
    findings.push(
      ...detectSecretsInText({
        text: capture.responseBody,
        location: "response-body",
        evidence,
        seed: capture.id,
        rules
      })
    );
    for (const [name, value] of Object.entries(capture.responseHeaders)) {
      if (/authorization|token|secret|key|set-cookie/i.test(name)) {
        findings.push(
          ...detectSecretsInText({
            text: value,
            location: "response-header",
            evidence,
            seed: `${capture.id}-${name}`,
            rules
          })
        );
      }
    }
  }
  for (const event of frames) {
    findings.push(
      ...detectSecretsInText({
        text: event.payloadData,
        location: "websocket-payload",
        evidence: evidenceFromWebSocket(event),
        seed: event.id,
        rules
      })
    );
  }
  return findings.slice(0, MAX_SIGNALS);
}

function likelySensitive(capture: CapturedRequest) {
  return (
    /\/(api|admin|account|accounts|me|profile|session|user|users|billing|settings)(\/|$|\?)/i.test(capture.url) ||
    Boolean(headerValue(capture.requestHeaders, "authorization")) ||
    Boolean(headerValue(capture.requestHeaders, "cookie")) ||
    Boolean(headerValue(capture.responseHeaders, "set-cookie"))
  );
}

function headerSignal(input: Omit<HeaderBehaviorSignal, "id">): HeaderBehaviorSignal {
  return {
    id: cleanId(`${input.kind}-${input.evidence.id}-${input.title}`),
    ...input
  };
}

export function analyzeHeaderBehavior(captures: CapturedRequest[]): HeaderBehaviorSignal[] {
  const signals: HeaderBehaviorSignal[] = [];
  for (const capture of captures) {
    const evidence = evidenceFromCapture(capture);
    const cache = headerValue(capture.responseHeaders, "cache-control");
    if (likelySensitive(capture) && !/(no-store|private|no-cache|max-age=0)/i.test(cache)) {
      signals.push(
        headerSignal({
          severity: "medium",
          kind: "cache-control",
          title: "Sensitive response cache policy is weak",
          message: `${capture.method} ${capture.url} appears sensitive but lacks a defensive Cache-Control policy.`,
          evidence,
          details: { cacheControl: cache || "missing" }
        })
      );
    }
    const origin = headerValue(capture.requestHeaders, "origin");
    const allowOrigin = headerValue(capture.responseHeaders, "access-control-allow-origin");
    const vary = headerValue(capture.responseHeaders, "vary");
    if (origin && allowOrigin === origin && !/origin/i.test(vary)) {
      signals.push(
        headerSignal({
          severity: "medium",
          kind: "cors-vary",
          title: "Reflected CORS origin without Vary",
          message: `${capture.url} reflects Origin without Vary: Origin.`,
          evidence,
          details: { origin, allowOrigin, vary: vary || "missing" }
        })
      );
    }
    const hostOverride = ["x-forwarded-host", "x-original-host", "host"]
      .map((name) => [name, headerValue(capture.requestHeaders, name)] as const)
      .find(([, value]) => Boolean(value && value !== capture.host));
    const responseJoin = `${headerValue(capture.responseHeaders, "location")} ${capture.responseBody.slice(0, 2000)}`;
    if (hostOverride && responseJoin.includes(hostOverride[1])) {
      signals.push(
        headerSignal({
          severity: "high",
          kind: "host-header",
          title: "Host override reflected in response",
          message: `${capture.url} reflects ${hostOverride[0]} in redirect or response content.`,
          evidence,
          details: { header: hostOverride[0], value: hostOverride[1] }
        })
      );
    }
    const location = headerValue(capture.responseHeaders, "location");
    if (location && /^https?:\/\//i.test(location) && hostFromUrl(location) && hostFromUrl(location) !== capture.host) {
      signals.push(
        headerSignal({
          severity: "low",
          kind: "redirect",
          title: "Cross-host redirect observed",
          message: `${capture.url} redirects to a different host.`,
          evidence,
          details: { location }
        })
      );
    }
    if (/public|max-age=\d+/i.test(cache) && Boolean(headerValue(capture.requestHeaders, "authorization"))) {
      signals.push(
        headerSignal({
          severity: "high",
          kind: "cache-poisoning",
          title: "Authenticated response can be cached",
          message: `${capture.url} used Authorization but returned cacheable response directives.`,
          evidence,
          details: { cacheControl: cache }
        })
      );
    }
  }
  return signals.slice(0, MAX_SIGNALS);
}

function workflowDraft(input: {
  id: string;
  name: string;
  description: string;
  mode?: "passive" | "active";
  steps: WorkflowDefinition["steps"];
  inputs?: WorkflowDefinition["inputs"];
  maxRequests?: number;
}): WorkflowDefinition {
  const createdAt = new Date().toISOString();
  const active = input.mode === "active";
  return {
    id: cleanId(input.id),
    name: cleanLine(input.name, "Advanced workflow draft"),
    description: cleanText(input.description),
    mode: active ? "active" : "passive",
    builtIn: false,
    inputs: input.inputs || [],
    scope: {
      requireInScope: true,
      allowActive: active,
      maxRequests: active ? Math.min(Math.max(input.maxRequests || 1, 1), 12) : 0,
      timeoutMs: 10_000,
      delayMs: 0,
      maxResults: active ? 40 : 80
    },
    steps: input.steps,
    createdAt,
    updatedAt: createdAt
  };
}

export function workflowDraftFromApiImport(importResult: ApiImportResult): WorkflowDefinition | null {
  if (!importResult.ok || importResult.drafts.length === 0) {
    return null;
  }
  const methods = uniqueSorted(importResult.drafts.map((draft) => draft.method));
  return workflowDraft({
    id: `advanced-api-import-${importResult.sourceType}`,
    name: `${importResult.sourceType.toUpperCase()} imported API review`,
    description: `Review ${importResult.drafts.length} imported ${importResult.sourceType} operations before active use. Methods: ${methods.join(", ")}.`,
    steps: [
      { id: "security-headers", title: "Security headers", kind: "security-headers", config: { source: "api-import" } },
      { id: "cors", title: "CORS behavior", kind: "cors-policy", config: { source: "api-import" } },
      { id: "cache", title: "Cache behavior", kind: "cache-control", config: { source: "api-import" } },
      { id: "metadata", title: "Metadata exposure", kind: "metadata-exposure", config: { source: "api-import" } }
    ]
  });
}

export function workflowDraftFromGraphQlOperation(operation: GraphQlOperation): WorkflowDefinition {
  const stepKind = operation.operationType === "mutation" ? "metadata-exposure" : "security-headers";
  return workflowDraft({
    id: `advanced-graphql-${operation.id}`,
    name: `GraphQL ${operation.operationName} review`,
    description: `Review ${operation.operationType} operation on ${operation.host}${operation.path}. Variables: ${operation.variables.join(", ") || "none"}.`,
    steps: [
      {
        id: "graphql-review",
        title: "GraphQL evidence review",
        kind: stepKind,
        config: {
          operation: operation.operationName,
          type: operation.operationType,
          path: operation.path
        }
      }
    ]
  });
}

export function workflowDraftFromAuthMatrixRow(row: AuthMatrixRow): WorkflowDefinition {
  return workflowDraft({
    id: `advanced-auth-${row.id}`,
    name: `${row.method} ${row.path} auth comparison`,
    description: `Replay the selected evidence without ambient credentials and compare authorization behavior. Observed verdict: ${row.verdict}.`,
    mode: "active",
    maxRequests: 1,
    inputs: [
      {
        id: "capture-id",
        label: "Capture ID",
        type: "capture-id",
        required: true,
        defaultValue: row.evidenceIds[0] || ""
      }
    ],
    steps: [
      {
        id: "strip-auth-replay",
        title: "Replay without ambient credentials",
        kind: "active-replay",
        config: { stripAuth: "true", path: row.path, method: row.method }
      }
    ]
  });
}

export function workflowDraftFromParameter(parameter: ParameterFinding): WorkflowDefinition {
  return workflowDraft({
    id: `advanced-parameter-${parameter.id}`,
    name: `${parameter.name} parameter review`,
    description: `Review ${parameter.location} parameter ${parameter.name} observed ${parameter.count} times across ${parameter.endpoints.length} endpoints.`,
    steps: [
      {
        id: "parameter-metadata",
        title: "Parameter evidence review",
        kind: "metadata-exposure",
        config: {
          parameter: parameter.name,
          location: parameter.location,
          endpoints: String(parameter.endpoints.length)
        }
      }
    ]
  });
}

export function workflowDraftFromHeaderSignal(signal: HeaderBehaviorSignal): WorkflowDefinition {
  const kind =
    signal.kind === "cache-control" || signal.kind === "cache-poisoning"
      ? "cache-control"
      : signal.kind === "cors-vary"
        ? "cors-policy"
        : "security-headers";
  return workflowDraft({
    id: `advanced-header-${signal.id}`,
    name: signal.title,
    description: signal.message,
    steps: [
      {
        id: "header-signal",
        title: signal.title,
        kind,
        config: {
          source: signal.kind,
          evidence: signal.evidence.id
        }
      }
    ]
  });
}

export function workflowDraftFromSecret(secret: SecretDetection): WorkflowDefinition {
  return workflowDraft({
    id: `advanced-secret-${secret.id}`,
    name: `${secret.pattern} disclosure review`,
    description: `Review local ${secret.pattern} signal in ${secret.location}. Preview is masked: ${secret.preview}.`,
    steps: [
      {
        id: "secret-metadata",
        title: "Secret-shaped response review",
        kind: "metadata-exposure",
        config: {
          pattern: secret.pattern,
          evidence: secret.evidence.id,
          location: secret.location
        }
      }
    ]
  });
}

export function buildAdvancedTestingSummary(
  captures: CapturedRequest[],
  frames: WebSocketEvent[] = [],
  importSource = "",
  fallbackBaseUrl = ""
): AdvancedTestingSummary {
  const authMatrix = buildAuthMatrix(captures);
  return {
    graphql: analyzeGraphQl(captures, frames),
    apiImport: parseApiImport(importSource, fallbackBaseUrl),
    authMatrix,
    authComparisons: compareAuthMatrixRows(authMatrix),
    parameters: discoverParameters(captures, frames),
    secretRules: DEFAULT_SENSITIVE_DATA_RULES,
    secrets: detectSensitiveData(captures, frames),
    headerSignals: analyzeHeaderBehavior(captures),
    proxyGuidance: ADVANCED_PROXY_GUIDANCE
  };
}
