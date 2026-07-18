import { isAllowedTarget } from "./allowlist.js";
import type { AdvancedTestingSummary } from "./advancedTesting.js";
import type {
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  InstalledPlugin,
  ProjectNote,
  ReplayCollection,
  ReplayTabState,
  SavedFilter,
  SavedView,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "./domain.js";
import { truncateText } from "./text.js";
import { redactSensitiveHeaders, redactSensitiveText } from "./redaction.js";

export type GlobalSearchKind =
  | "capture"
  | "websocket"
  | "replay"
  | "finding"
  | "workflow"
  | "workflow-run"
  | "plugin"
  | "advanced"
  | "saved-filter"
  | "note"
  | "saved-view";

export type GlobalSearchTargetView =
  | "traffic"
  | "websocket"
  | "repeater"
  | "findings"
  | "workflows"
  | "plugins"
  | "advanced"
  | "sitemap"
  | "scope"
  | "intercept"
  | "automate"
  | "ssl"
  | "notes";

export type GlobalSearchMatch = {
  field: string;
  label: string;
  snippet: string;
  start: number;
  end: number;
};

export type GlobalSearchTarget = {
  view: GlobalSearchTargetView;
  id?: string;
  secondaryId?: string;
  query?: string;
};

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle: string;
  detail: string;
  refId: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  host?: string;
  path?: string;
  status?: string;
  severity?: string;
  source?: string;
  score: number;
  matches: GlobalSearchMatch[];
  target: GlobalSearchTarget;
};

export type GlobalSearchRequest = {
  query: string;
  limit?: number;
  offset?: number;
};

export type GlobalSearchResponse = {
  ok: boolean;
  query: string;
  results: GlobalSearchResult[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

export type GlobalSearchInput = {
  captures?: CapturedRequest[];
  webSocketEvents?: WebSocketEvent[];
  evidenceAnnotations?: EvidenceAnnotation[];
  replayTabState?: ReplayTabState;
  replayCollections?: ReplayCollection[];
  findings?: Finding[];
  workflows?: WorkflowDefinition[];
  workflowRuns?: WorkflowRun[];
  plugins?: InstalledPlugin[];
  advancedSummary?: AdvancedTestingSummary;
  savedFilters?: SavedFilter[];
  projectNotes?: ProjectNote[];
  savedViews?: SavedView[];
  allowlist?: string[];
};

type ParsedQuery = {
  terms: string[];
  filters: Partial<Record<"kind" | "host" | "path" | "status" | "severity" | "source", string[]>>;
};

type Candidate = Omit<GlobalSearchResult, "score" | "matches"> & {
  fields: Array<{ name: string; label: string; text: string; weight: number }>;
};

const MAX_QUERY_LENGTH = 400;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 80;
const DETAIL_LIMIT = 360;
const FIELD_LIMIT = 5000;
const SEARCH_KINDS: GlobalSearchKind[] = [
  "capture",
  "websocket",
  "replay",
  "finding",
  "workflow",
  "workflow-run",
  "plugin",
  "advanced",
  "saved-filter",
  "note",
  "saved-view"
];

const filterAliases: Record<string, keyof ParsedQuery["filters"]> = {
  k: "kind",
  kind: "kind",
  type: "kind",
  host: "host",
  path: "path",
  status: "status",
  severity: "severity",
  sev: "severity",
  source: "source"
};

function cleanText(value: unknown, limit = FIELD_LIMIT) {
  return truncateText(String(value || "").trim(), limit);
}

function clampLimit(value: unknown) {
  return Math.max(1, Math.min(Number(value) || DEFAULT_LIMIT, MAX_LIMIT));
}

function clampOffset(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function splitQuery(input: string): string[] | { error: string } {
  const tokens: string[] = [];
  let index = 0;
  while (index < input.length) {
    while (/\s/.test(input[index] || "")) {
      index += 1;
    }
    if (index >= input.length) {
      break;
    }
    const quote = input[index] === "\"" || input[index] === "'" ? input[index] : "";
    if (quote) {
      index += 1;
      let value = "";
      while (index < input.length && input[index] !== quote) {
        if (input[index] === "\\" && index + 1 < input.length) {
          value += input[index + 1];
          index += 2;
        } else {
          value += input[index];
          index += 1;
        }
      }
      if (index >= input.length) {
        return { error: "Unclosed quoted search term." };
      }
      index += 1;
      if (value.trim()) {
        tokens.push(value.trim());
      }
      continue;
    }
    let value = "";
    while (index < input.length && !/\s/.test(input[index])) {
      value += input[index];
      index += 1;
    }
    if (value.trim()) {
      tokens.push(value.trim());
    }
  }
  return tokens;
}

export function parseGlobalSearchQuery(input: string): { ok: true; query: ParsedQuery } | { ok: false; error: string } {
  const text = String(input || "").trim().slice(0, MAX_QUERY_LENGTH);
  const tokens = splitQuery(text);
  if (!Array.isArray(tokens)) {
    return { ok: false, error: tokens.error };
  }

  const terms: string[] = [];
  const filters: ParsedQuery["filters"] = {};
  for (const token of tokens) {
    const separator = token.indexOf(":");
    if (separator > 0) {
      const rawField = token.slice(0, separator).trim().toLowerCase();
      const field = filterAliases[rawField];
      if (!field) {
        return { ok: false, error: `Unknown global search filter "${rawField}".` };
      }
      const values = token
        .slice(separator + 1)
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (values.length === 0) {
        return { ok: false, error: `Global search filter "${rawField}" needs a value.` };
      }
      if (field === "kind") {
        const invalid = values.find((value) => !SEARCH_KINDS.includes(value as GlobalSearchKind));
        if (invalid) {
          return { ok: false, error: `Unknown global search kind "${invalid}".` };
        }
      }
      filters[field] = [...(filters[field] || []), ...values];
      continue;
    }
    terms.push(token.toLowerCase());
  }

  return { ok: true, query: { terms, filters } };
}

function field(name: string, label: string, text: unknown, weight = 1) {
  return { name, label, text: cleanText(text), weight };
}

function firstSnippet(text: string, needle: string) {
  const haystack = text.toLowerCase();
  const start = haystack.indexOf(needle);
  if (start === -1) {
    return null;
  }
  const from = Math.max(0, start - 52);
  const to = Math.min(text.length, start + needle.length + 88);
  const prefix = from > 0 ? "..." : "";
  const suffix = to < text.length ? "..." : "";
  return {
    snippet: `${prefix}${text.slice(from, to)}${suffix}`,
    start,
    end: start + needle.length
  };
}

function resultMatches(candidate: Candidate, terms: string[]) {
  if (terms.length === 0) {
    return { ok: true, score: 1, matches: [] as GlobalSearchMatch[] };
  }

  let score = 0;
  const matches: GlobalSearchMatch[] = [];
  for (const term of terms) {
    let termMatched = false;
    for (const searchField of candidate.fields) {
      const match = firstSnippet(searchField.text, term);
      if (!match) {
        continue;
      }
      termMatched = true;
      score += searchField.weight;
      if (matches.length < 8) {
        matches.push({
          field: searchField.name,
          label: searchField.label,
          snippet: match.snippet,
          start: match.start,
          end: match.end
        });
      }
    }
    if (!termMatched) {
      return { ok: false, score: 0, matches: [] as GlobalSearchMatch[] };
    }
  }
  return { ok: true, score, matches };
}

function filterMatches(candidate: Candidate, filters: ParsedQuery["filters"]) {
  const checks: Array<[keyof ParsedQuery["filters"], string | undefined, "exact" | "contains"]> = [
    ["kind", candidate.kind, "exact"],
    ["host", candidate.host, "contains"],
    ["path", candidate.path, "contains"],
    ["status", candidate.status, "exact"],
    ["severity", candidate.severity, "exact"],
    ["source", candidate.source, "exact"]
  ];
  for (const [filter, rawValue, mode] of checks) {
    const values = filters[filter];
    if (!values?.length) {
      continue;
    }
    const value = String(rawValue || "").toLowerCase();
    if (!value) {
      return false;
    }
    const matched = values.some((entry) => (mode === "exact" ? value === entry : value.includes(entry)));
    if (!matched) {
      return false;
    }
  }
  return true;
}

function headersText(headers: Record<string, string> | undefined) {
  return Object.entries(redactSensitiveHeaders(headers || {}))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function annotationText(id: string, kind: EvidenceAnnotation["kind"], annotations: Map<string, EvidenceAnnotation>) {
  const annotation = annotations.get(`${kind}:${id}`);
  if (!annotation) {
    return "";
  }
  return [annotation.tags.join(" "), annotation.comment].filter(Boolean).join("\n");
}

function toAnnotationMap(annotations: EvidenceAnnotation[] = []) {
  return new Map(annotations.map((annotation) => [`${annotation.kind}:${annotation.evidenceId}`, annotation]));
}

function candidate(input: Omit<Candidate, "fields"> & { fields: Candidate["fields"] }): Candidate {
  return input;
}

function captureCandidates(
  captures: CapturedRequest[],
  allowlist: string[],
  annotations: Map<string, EvidenceAnnotation>
) {
  return captures
    .filter((capture) => capture.allowed && isAllowedTarget(capture.url, allowlist))
    .map((capture) =>
      candidate({
        id: `capture:${capture.id}`,
        kind: "capture",
        title: `${capture.method} ${capture.status ?? "pending"} ${capture.path}`,
        subtitle: capture.host,
        detail: cleanText(`${capture.url} ${capture.mimeType} ${capture.type}`, DETAIL_LIMIT),
        refId: capture.id,
        createdAt: capture.startedAt,
        updatedAt: capture.startedAt,
        url: capture.url,
        host: capture.host,
        path: capture.path,
        status: capture.status ? String(capture.status) : "pending",
        source: capture.source,
        target: { view: "traffic", id: capture.id },
        fields: [
          field("title", "Title", `${capture.method} ${capture.status ?? ""} ${capture.path}`, 7),
          field("url", "URL", capture.url, 6),
          field("host", "Host", capture.host, 5),
          field("headers", "Headers", `${headersText(capture.requestHeaders)}\n${headersText(capture.responseHeaders)}`, 3),
          field("body", "Body", redactSensitiveText(`${capture.requestBody}\n${capture.responseBody}`), 2),
          field("annotation", "Annotation", annotationText(capture.id, "capture", annotations), 4)
        ]
      })
    );
}

function webSocketCandidates(
  events: WebSocketEvent[],
  allowlist: string[],
  annotations: Map<string, EvidenceAnnotation>
) {
  return events
    .filter((event) => event.allowed && isAllowedTarget(event.url, allowlist))
    .map((event) =>
      candidate({
        id: `websocket:${event.id}`,
        kind: "websocket",
        title: `${event.direction} ${event.url}`,
        subtitle: `${event.host}${event.status ? ` / ${event.status}` : ""}`,
        detail: cleanText(event.error || event.payloadData || event.statusText || "WebSocket frame", DETAIL_LIMIT),
        refId: event.id,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        url: event.url,
        host: event.host,
        status: event.status ? String(event.status) : undefined,
        source: event.direction,
        target: { view: "websocket", id: event.id },
        fields: [
          field("title", "Title", `${event.direction} ${event.url}`, 7),
          field("url", "URL", event.url, 6),
          field("payload", "Payload", redactSensitiveText(event.payloadData), 4),
          field("headers", "Headers", `${headersText(event.requestHeaders)}\n${headersText(event.responseHeaders)}`, 2),
          field("annotation", "Annotation", annotationText(event.id, "websocket", annotations), 4),
          field("error", "Error", event.error || "", 5)
        ]
      })
    );
}

function replayCandidates(state: ReplayTabState | undefined, collections: ReplayCollection[] = []) {
  const tabs = state?.tabs || [];
  const tabResults = tabs.flatMap((tab) => {
    const tabCandidate = candidate({
      id: `replay:${tab.id}`,
      kind: "replay",
      title: tab.name,
      subtitle: `${tab.draft.method} ${tab.draft.url}`,
      detail: cleanText("Repeater tab draft", DETAIL_LIMIT),
      refId: tab.id,
      createdAt: tab.createdAt,
      updatedAt: tab.updatedAt,
      url: tab.draft.url,
      source: tab.pinned ? "pinned" : "draft",
      target: { view: "repeater", id: tab.id },
      fields: [
        field("title", "Title", tab.name, 7),
        field("url", "URL", tab.draft.url, 6),
        field("headers", "Headers", headersText(tab.draft.headers), 3),
        field("body", "Body", tab.draft.body, 2)
      ]
    });
    const history = tab.history.map((entry) =>
      candidate({
        id: `replay:${tab.id}:${entry.id}`,
        kind: "replay",
        title: `${tab.name} / ${entry.result.status}`,
        subtitle: `${entry.draft.method} ${entry.draft.url}`,
        detail: cleanText(entry.result.statusText || entry.result.body || "Replay history entry", DETAIL_LIMIT),
        refId: entry.id,
        createdAt: entry.sentAt,
        updatedAt: entry.sentAt,
        url: entry.draft.url,
        status: String(entry.result.status),
        source: "history",
        target: { view: "repeater", id: tab.id, secondaryId: entry.id },
        fields: [
          field("title", "Title", `${tab.name} ${entry.result.status} ${entry.result.statusText}`, 7),
          field("url", "URL", entry.draft.url, 6),
          field("headers", "Headers", `${headersText(entry.draft.headers)}\n${headersText(entry.result.headers)}`, 3),
          field("body", "Body", `${entry.draft.body}\n${entry.result.body}`, 2)
        ]
      })
    );
    return [tabCandidate, ...history];
  });

  const collectionResults = collections.flatMap((collection) =>
    collection.items.map((item) =>
      candidate({
        id: `replay:collection:${collection.id}:${item.id}`,
        kind: "replay",
        title: `${collection.name} / ${item.name}`,
        subtitle: `${item.draft.method} ${item.draft.url}`,
        detail: cleanText(item.tags.join(", ") || "Replay collection item", DETAIL_LIMIT),
        refId: item.id,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        url: item.draft.url,
        source: "collection",
        target: { view: "repeater", id: item.id },
        fields: [
          field("title", "Title", `${collection.name} ${item.name}`, 7),
          field("url", "URL", item.draft.url, 6),
          field("headers", "Headers", headersText(item.draft.headers), 3),
          field("body", "Body", item.draft.body, 2),
          field("tags", "Tags", item.tags.join(" "), 4)
        ]
      })
    )
  );

  return [...tabResults, ...collectionResults];
}

function findingCandidates(findings: Finding[] = []) {
  return findings.map((finding) =>
    candidate({
      id: `finding:${finding.id}`,
      kind: "finding",
      title: finding.title,
      subtitle: `${finding.severity} / ${finding.status}`,
      detail: cleanText(finding.notes || finding.reproductionSteps || finding.impact, DETAIL_LIMIT),
      refId: finding.id,
      createdAt: finding.createdAt,
      updatedAt: finding.updatedAt,
      status: finding.status,
      severity: finding.severity,
      source: finding.source,
      target: { view: "findings", id: finding.id },
      fields: [
        field("title", "Title", finding.title, 8),
        field("assets", "Assets", finding.affectedAssets.join(" "), 5),
        field("reproduction", "Reproduction", finding.reproductionSteps, 4),
        field("impact", "Impact", finding.impact, 3),
        field("remediation", "Remediation", finding.remediation, 3),
        field("notes", "Notes", finding.notes, 4),
        field("evidence", "Evidence", finding.evidence.map((ref) => `${ref.kind}:${ref.id} ${ref.label}`).join("\n"), 4)
      ]
    })
  );
}

function workflowCandidates(workflows: WorkflowDefinition[] = [], runs: WorkflowRun[] = []) {
  const definitions = workflows.map((workflow) =>
    candidate({
      id: `workflow:${workflow.id}`,
      kind: "workflow",
      title: workflow.name,
      subtitle: `${workflow.mode}${workflow.builtIn ? " / built-in" : ""}`,
      detail: cleanText(workflow.description, DETAIL_LIMIT),
      refId: workflow.id,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      status: workflow.mode,
      source: workflow.builtIn ? "built-in" : "saved",
      target: { view: "workflows", id: workflow.id },
      fields: [
        field("title", "Title", workflow.name, 8),
        field("description", "Description", workflow.description, 5),
        field("steps", "Steps", workflow.steps.map((step) => `${step.title} ${step.kind}`).join("\n"), 4),
        field("inputs", "Inputs", workflow.inputs.map((input) => `${input.label} ${input.id}`).join("\n"), 3)
      ]
    })
  );

  const runResults = runs.map((run) =>
    candidate({
      id: `workflow-run:${run.id}`,
      kind: "workflow-run",
      title: `${run.workflowName} / ${run.status}`,
      subtitle: `${run.results.length} results / ${run.source}`,
      detail: cleanText(run.error || run.results.map((result) => result.title).join(", "), DETAIL_LIMIT),
      refId: run.id,
      createdAt: run.startedAt,
      updatedAt: run.completedAt || run.startedAt,
      status: run.status,
      source: run.source,
      target: { view: "workflows", id: run.workflowId, secondaryId: run.id },
      fields: [
        field("title", "Title", `${run.workflowName} ${run.status}`, 8),
        field("inputs", "Inputs", Object.entries(run.inputs).map(([key, value]) => `${key}: ${value}`).join("\n"), 3),
        field("results", "Results", run.results.map((result) => `${result.level} ${result.title} ${result.message}`).join("\n"), 5),
        field("error", "Error", run.error || "", 5)
      ]
    })
  );

  return [...definitions, ...runResults];
}

function pluginCandidates(plugins: InstalledPlugin[] = []) {
  return plugins.map((plugin) =>
    candidate({
      id: `plugin:${plugin.id}`,
      kind: "plugin",
      title: plugin.manifest.name,
      subtitle: `${plugin.status} / ${plugin.manifest.version}`,
      detail: cleanText(plugin.manifest.description || plugin.warnings.join(", "), DETAIL_LIMIT),
      refId: plugin.id,
      createdAt: plugin.installedAt,
      updatedAt: plugin.updatedAt,
      status: plugin.status,
      source: plugin.manifest.author,
      target: { view: "plugins", id: plugin.id },
      fields: [
        field("title", "Title", `${plugin.manifest.name} ${plugin.id}`, 8),
        field("description", "Description", plugin.manifest.description, 5),
        field("permissions", "Permissions", plugin.manifest.permissions.join(" "), 4),
        field("panels", "Panels", plugin.manifest.panels.map((panel) => panel.title).join(" "), 3),
        field("warnings", "Warnings", plugin.warnings.join(" "), 4)
      ]
    })
  );
}

function advancedCandidates(summary: AdvancedTestingSummary | undefined) {
  if (!summary) {
    return [];
  }

  const operations = summary.graphql.operations.map((operation) =>
    candidate({
      id: `advanced:graphql:${operation.id}`,
      kind: "advanced",
      title: `GraphQL ${operation.operationType}: ${operation.operationName}`,
      subtitle: `${operation.transport} / ${operation.host}${operation.path}`,
      detail: cleanText(operation.variables.join(", ") || operation.evidence.label, DETAIL_LIMIT),
      refId: operation.id,
      createdAt: operation.evidence.createdAt,
      updatedAt: operation.evidence.createdAt,
      url: operation.evidence.url,
      host: operation.host,
      path: operation.path,
      source: "graphql",
      target: { view: "advanced", id: operation.id },
      fields: [
        field("title", "Title", `${operation.operationName} ${operation.operationType}`, 8),
        field("host", "Host", `${operation.host} ${operation.path}`, 5),
        field("variables", "Variables", operation.variables.join(" "), 4),
        field("evidence", "Evidence", operation.evidence.label, 4)
      ]
    })
  );

  const auth = summary.authMatrix.map((row) =>
    candidate({
      id: `advanced:auth:${row.id}`,
      kind: "advanced",
      title: `Auth matrix: ${row.method} ${row.path}`,
      subtitle: `${row.host} / ${row.verdict}`,
      detail: cleanText(Object.entries(row.statuses).map(([key, value]) => `${key}: ${value}`).join(", "), DETAIL_LIMIT),
      refId: row.id,
      createdAt: "",
      updatedAt: "",
      host: row.host,
      path: row.path,
      status: row.verdict,
      source: "auth-matrix",
      target: { view: "advanced", id: row.id },
      fields: [
        field("title", "Title", `${row.method} ${row.path} ${row.verdict}`, 8),
        field("host", "Host", row.host, 5),
        field("statuses", "Statuses", Object.entries(row.statuses).map(([key, value]) => `${key}: ${value}`).join("\n"), 4)
      ]
    })
  );

  const parameters = summary.parameters.map((parameter) =>
    candidate({
      id: `advanced:parameter:${parameter.id}`,
      kind: "advanced",
      title: `Parameter: ${parameter.name}`,
      subtitle: `${parameter.location} / ${parameter.count} hits`,
      detail: cleanText(parameter.endpoints.join(", "), DETAIL_LIMIT),
      refId: parameter.id,
      createdAt: parameter.examples[0]?.createdAt || "",
      updatedAt: parameter.examples[0]?.createdAt || "",
      host: parameter.hosts[0],
      source: "parameters",
      target: { view: "advanced", id: parameter.id },
      fields: [
        field("title", "Title", `${parameter.name} ${parameter.location}`, 8),
        field("hosts", "Hosts", parameter.hosts.join(" "), 5),
        field("endpoints", "Endpoints", parameter.endpoints.join(" "), 5)
      ]
    })
  );

  const secrets = summary.secrets.map((secret) =>
    candidate({
      id: `advanced:secret:${secret.id}`,
      kind: "advanced",
      title: `${secret.pattern} signal`,
      subtitle: `${secret.location} / ${secret.severity}`,
      detail: cleanText(secret.preview, DETAIL_LIMIT),
      refId: secret.id,
      createdAt: secret.evidence.createdAt,
      updatedAt: secret.evidence.createdAt,
      url: secret.evidence.url,
      host: secret.evidence.host,
      severity: secret.severity,
      source: "secret",
      target: { view: "advanced", id: secret.id },
      fields: [
        field("title", "Title", `${secret.pattern} ${secret.location}`, 8),
        field("preview", "Preview", secret.preview, 5),
        field("evidence", "Evidence", secret.evidence.label, 4)
      ]
    })
  );

  const headers = summary.headerSignals.map((signal) =>
    candidate({
      id: `advanced:header:${signal.id}`,
      kind: "advanced",
      title: signal.title,
      subtitle: `${signal.kind} / ${signal.severity}`,
      detail: cleanText(signal.message, DETAIL_LIMIT),
      refId: signal.id,
      createdAt: signal.evidence.createdAt,
      updatedAt: signal.evidence.createdAt,
      url: signal.evidence.url,
      host: signal.evidence.host,
      severity: signal.severity,
      source: signal.kind,
      target: { view: "advanced", id: signal.id },
      fields: [
        field("title", "Title", signal.title, 8),
        field("message", "Message", signal.message, 5),
        field("details", "Details", Object.entries(signal.details).map(([key, value]) => `${key}: ${value}`).join("\n"), 3)
      ]
    })
  );

  const guidance = summary.proxyGuidance.map((guide) =>
    candidate({
      id: `advanced:proxy:${guide.id}`,
      kind: "advanced",
      title: guide.title,
      subtitle: guide.id,
      detail: cleanText(guide.summary, DETAIL_LIMIT),
      refId: guide.id,
      createdAt: "",
      updatedAt: "",
      source: "proxy-guidance",
      target: { view: "advanced", id: guide.id },
      fields: [
        field("title", "Title", guide.title, 8),
        field("summary", "Summary", guide.summary, 5),
        field("checklist", "Checklist", guide.checklist.join("\n"), 4)
      ]
    })
  );

  return [...operations, ...auth, ...parameters, ...secrets, ...headers, ...guidance];
}

function savedFilterCandidates(filters: SavedFilter[] = []) {
  return filters.map((filterItem) =>
    candidate({
      id: `saved-filter:${filterItem.id}`,
      kind: "saved-filter",
      title: filterItem.name,
      subtitle: `${filterItem.surface} / ${filterItem.query}`,
      detail: cleanText(filterItem.query, DETAIL_LIMIT),
      refId: filterItem.id,
      createdAt: filterItem.createdAt,
      updatedAt: filterItem.updatedAt,
      source: filterItem.surface,
      target: {
        view: filterItem.surface === "websocket" ? "websocket" : "traffic",
        id: filterItem.id,
        query: filterItem.query
      },
      fields: [
        field("title", "Title", filterItem.name, 8),
        field("query", "Query", filterItem.query, 6),
        field("surface", "Surface", filterItem.surface, 3)
      ]
    })
  );
}

function projectNoteCandidates(notes: ProjectNote[] = []) {
  return notes.map((note) =>
    candidate({
      id: `note:${note.id}`,
      kind: "note",
      title: note.title,
      subtitle: "Project note",
      detail: cleanText(note.body, DETAIL_LIMIT),
      refId: note.id,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      source: "notes",
      target: { view: "notes", id: note.id },
      fields: [
        field("title", "Title", note.title, 8),
        field("body", "Body", note.body, 5)
      ]
    })
  );
}

function savedViewCandidates(views: SavedView[] = []) {
  return views.map((view) =>
    candidate({
      id: `saved-view:${view.id}`,
      kind: "saved-view",
      title: view.name,
      subtitle: `${view.view} saved view`,
      detail: cleanText(view.description || Object.entries(view.state).map(([key, value]) => `${key}: ${value}`).join(", "), DETAIL_LIMIT),
      refId: view.id,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      source: view.view,
      target: { view: view.view, id: view.id },
      fields: [
        field("title", "Title", view.name, 8),
        field("description", "Description", view.description, 5),
        field("view", "View", view.view, 4),
        field("state", "State", Object.entries(view.state).map(([key, value]) => `${key}: ${value}`).join("\n"), 4)
      ]
    })
  );
}

function allCandidates(input: GlobalSearchInput): Candidate[] {
  const annotations = toAnnotationMap(input.evidenceAnnotations);
  const allowlist = input.allowlist?.length ? input.allowlist : [];
  return [
    ...captureCandidates(input.captures || [], allowlist, annotations),
    ...webSocketCandidates(input.webSocketEvents || [], allowlist, annotations),
    ...replayCandidates(input.replayTabState, input.replayCollections),
    ...findingCandidates(input.findings),
    ...workflowCandidates(input.workflows, input.workflowRuns),
    ...pluginCandidates(input.plugins),
    ...advancedCandidates(input.advancedSummary),
    ...savedFilterCandidates(input.savedFilters),
    ...projectNoteCandidates(input.projectNotes),
    ...savedViewCandidates(input.savedViews)
  ];
}

export function searchGlobal(input: GlobalSearchInput, request: GlobalSearchRequest): GlobalSearchResponse {
  const queryText = String(request.query || "").trim().slice(0, MAX_QUERY_LENGTH);
  const parsed = parseGlobalSearchQuery(queryText);
  const limit = clampLimit(request.limit);
  const offset = clampOffset(request.offset);
  if (!parsed.ok) {
    return { ok: false, query: queryText, results: [], total: 0, limit, offset, error: parsed.error };
  }

  const results = allCandidates(input)
    .filter((item) => filterMatches(item, parsed.query.filters))
    .map((item) => {
      const matched = resultMatches(item, parsed.query.terms);
      if (!matched.ok) {
        return null;
      }
      const base = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "fields")) as Omit<
        Candidate,
        "fields"
      >;
      return { ...base, score: matched.score, matches: matched.matches };
    })
    .filter((item): item is GlobalSearchResult => Boolean(item))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
    });

  return {
    ok: true,
    query: queryText,
    results: results.slice(offset, offset + limit),
    total: results.length,
    limit,
    offset
  };
}
