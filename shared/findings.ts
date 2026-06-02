import type { AgentFinding } from "./agent-types.js";
import type {
  AutomateResult,
  AutomateSession,
  CapturedRequest,
  Finding,
  FindingConfidence,
  FindingEvidenceKind,
  FindingEvidenceRef,
  FindingReport,
  FindingReportOptions,
  FindingSeverity,
  FindingTemplateId,
  ReplayHistoryEntry,
  WebSocketEvent
} from "./domain.js";
import { truncateText } from "./text.js";

export const MAX_FINDINGS = 500;
export const MAX_FINDING_EVIDENCE = 40;
export const MAX_FINDING_FIELD = 12000;
export const MAX_FINDING_LINE = 240;

const findingSeverities = ["info", "low", "medium", "high", "critical"] as const;
const findingConfidences = ["low", "medium", "high"] as const;
const findingStatuses = ["draft", "reviewed", "accepted-risk", "retest-passed", "retest-failed"] as const;
const findingEvidenceKinds = ["capture", "websocket", "replay", "automate", "workflow", "ai"] as const;

export type FindingTemplate = {
  id: FindingTemplateId;
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  impact: string;
  remediation: string;
};

export const FINDING_TEMPLATES: FindingTemplate[] = [
  {
    id: "auth",
    title: "Authentication control weakness",
    severity: "high",
    confidence: "medium",
    impact: "An attacker may be able to authenticate, reset credentials, or access account state in a way the application does not intend.",
    remediation: "Review the affected authentication flow, enforce server-side checks, and add regression coverage for the bypass condition."
  },
  {
    id: "session",
    title: "Session management weakness",
    severity: "medium",
    confidence: "medium",
    impact: "Session tokens or browser state may remain valid longer than intended or lack expected protection against theft or replay.",
    remediation: "Tighten session lifetime, rotation, cookie flags, invalidation, and server-side authorization checks."
  },
  {
    id: "cors",
    title: "Permissive CORS policy",
    severity: "medium",
    confidence: "medium",
    impact: "Cross-origin callers may be able to read sensitive API responses when a victim browser sends ambient credentials.",
    remediation: "Allow only trusted origins, avoid reflective origins, and do not combine wildcard-like behavior with credentialed responses."
  },
  {
    id: "cache",
    title: "Sensitive response caching",
    severity: "low",
    confidence: "medium",
    impact: "Sensitive responses may be stored in browser, proxy, or shared caches beyond the intended user session.",
    remediation: "Set appropriate Cache-Control, Pragma, and Vary headers on sensitive authenticated responses."
  },
  {
    id: "headers",
    title: "Missing security headers",
    severity: "low",
    confidence: "high",
    impact: "The application loses browser-enforced hardening against clickjacking, MIME confusion, transport downgrade, or content injection.",
    remediation: "Add the missing headers with values appropriate to the application routes and deployment model."
  },
  {
    id: "idor",
    title: "Object-level authorization weakness",
    severity: "high",
    confidence: "medium",
    impact: "A user may access or modify another user's object by changing identifiers in requests.",
    remediation: "Authorize every object access server-side against the authenticated principal and tenant context."
  },
  {
    id: "injection-signal",
    title: "Injection behavior signal",
    severity: "medium",
    confidence: "low",
    impact: "Input handling may be reaching an interpreter, query layer, shell, template engine, or parser in an unsafe way.",
    remediation: "Validate input, use parameterized APIs or safe encoders, and investigate the referenced behavior before confirming exploitability."
  },
  {
    id: "access-control",
    title: "Access control enforcement gap",
    severity: "high",
    confidence: "medium",
    impact: "A lower-privileged user may reach functionality or data intended for another role, tenant, or trust boundary.",
    remediation: "Centralize authorization checks and add negative tests for role, tenant, and ownership boundaries."
  },
  {
    id: "information-disclosure",
    title: "Information disclosure",
    severity: "medium",
    confidence: "medium",
    impact: "Responses expose data that can aid account takeover, lateral movement, privacy impact, or targeted attack planning.",
    remediation: "Remove unnecessary sensitive data from responses and apply least-disclosure defaults at API boundaries."
  }
];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanLine(value: unknown, fallback = "") {
  return String(value || fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FINDING_LINE);
}

function cleanText(value: unknown) {
  return truncateText(String(value || "").trim(), MAX_FINDING_FIELD);
}

function cleanStringList(value: unknown, max = 24) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return Array.from(
    new Set(
      items
        .map((item) => cleanLine(item))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(String(value) as T[number]) ? (String(value) as T[number]) : fallback;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [cleanLine(key), cleanLine(entry)])
      .filter(([key, entry]) => key && entry)
      .slice(0, 16)
  );
}

export function parseFindingEvidenceRef(value: string): { kind: FindingEvidenceKind; id: string } | null {
  const [kind, ...rest] = String(value || "").trim().split(":");
  const id = rest.join(":").trim();
  if (!findingEvidenceKinds.includes(kind as FindingEvidenceKind) || !id) {
    return null;
  }
  return { kind: kind as FindingEvidenceKind, id };
}

export function normalizeFindingEvidenceRef(input: unknown, createdAt = nowIso()): FindingEvidenceRef | null {
  if (typeof input === "string") {
    const parsed = parseFindingEvidenceRef(input);
    if (!parsed) {
      return null;
    }
    return {
      id: parsed.id,
      kind: parsed.kind,
      label: `${parsed.kind}:${parsed.id}`,
      createdAt,
      metadata: {}
    };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const kind = normalizeEnum(record.kind, findingEvidenceKinds, "capture");
  const id = cleanLine(record.id);
  if (!id) {
    return null;
  }
  return {
    id,
    kind,
    label: cleanLine(record.label, `${kind}:${id}`),
    createdAt: cleanLine(record.createdAt, createdAt),
    metadata: normalizeMetadata(record.metadata)
  };
}

export function evidenceRefKey(ref: FindingEvidenceRef) {
  return `${ref.kind}:${ref.id}`;
}

export function normalizeFinding(input: unknown, createdAt = nowIso()): Finding | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const title = cleanLine(record.title, "Untitled finding");
  if (!title) {
    return null;
  }
  const evidence = (Array.isArray(record.evidence) ? record.evidence : [])
    .map((entry) => normalizeFindingEvidenceRef(entry, createdAt))
    .filter((entry): entry is FindingEvidenceRef => Boolean(entry));
  const uniqueEvidence = Array.from(new Map(evidence.map((entry) => [evidenceRefKey(entry), entry])).values()).slice(
    0,
    MAX_FINDING_EVIDENCE
  );
  if (uniqueEvidence.length === 0) {
    return null;
  }
  const templateId = FINDING_TEMPLATES.some((template) => template.id === record.templateId)
    ? (record.templateId as FindingTemplateId)
    : undefined;
  const status = normalizeEnum(record.status, findingStatuses, "draft");
  const reviewedAt = typeof record.reviewedAt === "string" ? cleanLine(record.reviewedAt) : "";
  return {
    id: cleanLine(record.id, createId("finding")),
    title,
    templateId,
    severity: normalizeEnum(record.severity, findingSeverities, "medium"),
    confidence: normalizeEnum(record.confidence, findingConfidences, "medium"),
    status,
    affectedAssets: cleanStringList(record.affectedAssets),
    evidence: uniqueEvidence,
    reproductionSteps: cleanText(record.reproductionSteps),
    impact: cleanText(record.impact),
    remediation: cleanText(record.remediation),
    notes: cleanText(record.notes),
    owner: cleanLine(record.owner),
    retestResult: cleanText(record.retestResult),
    source: record.source === "ai" || record.source === "automate" || record.source === "workflow" ? record.source : "manual",
    sourceId: cleanLine(record.sourceId) || undefined,
    createdAt: cleanLine(record.createdAt, createdAt),
    updatedAt: cleanLine(record.updatedAt, createdAt),
    reviewedAt: reviewedAt || (status === "reviewed" ? createdAt : undefined)
  };
}

export function normalizeFindings(input: unknown): Finding[] {
  const values = Array.isArray(input) ? input : [];
  return values
    .map((entry) => normalizeFinding(entry))
    .filter((entry): entry is Finding => Boolean(entry))
    .slice(0, MAX_FINDINGS);
}

export function findingFromTemplate(templateId: FindingTemplateId, evidence: FindingEvidenceRef[] = []): Finding {
  const template = FINDING_TEMPLATES.find((entry) => entry.id === templateId) || FINDING_TEMPLATES[0];
  const createdAt = nowIso();
  return {
    id: createId("finding"),
    title: template.title,
    templateId: template.id,
    severity: template.severity,
    confidence: template.confidence,
    status: "draft",
    affectedAssets: [],
    evidence: evidence.slice(0, MAX_FINDING_EVIDENCE),
    reproductionSteps: "",
    impact: template.impact,
    remediation: template.remediation,
    notes: "",
    owner: "",
    retestResult: "",
    source: "manual",
    createdAt,
    updatedAt: createdAt
  };
}

export function evidenceRefFromCapture(capture: CapturedRequest): FindingEvidenceRef {
  return {
    id: capture.id,
    kind: "capture",
    label: `${capture.method} ${capture.url}`,
    createdAt: capture.startedAt,
    metadata: {
      status: capture.status ? String(capture.status) : "pending",
      host: capture.host,
      source: capture.source
    }
  };
}

export function evidenceRefFromWebSocket(event: WebSocketEvent): FindingEvidenceRef {
  return {
    id: event.id,
    kind: "websocket",
    label: `${event.direction} ${event.url}`,
    createdAt: event.createdAt,
    metadata: {
      host: event.host,
      size: String(event.size),
      opcode: event.opcode ? String(event.opcode) : ""
    }
  };
}

export function evidenceRefFromReplay(entry: ReplayHistoryEntry): FindingEvidenceRef {
  return {
    id: entry.id,
    kind: "replay",
    label: `${entry.draft.method} ${entry.draft.url}`,
    createdAt: entry.sentAt,
    metadata: {
      status: String(entry.result.status),
      durationMs: String(entry.result.durationMs)
    }
  };
}

export function evidenceRefFromAutomateResult(session: AutomateSession, result: AutomateResult): FindingEvidenceRef {
  return {
    id: `${session.id}:${result.id}`,
    kind: "automate",
    label: `${session.name} #${result.index} ${result.request.method} ${result.request.url}`,
    createdAt: result.createdAt,
    metadata: {
      payload: result.payload,
      status: result.error ? "error" : String(result.status),
      cluster: result.clusterId || "",
      matches: String(result.matchedRules.length + result.extracts.length)
    }
  };
}

export function evidenceRefFromAi(runId: string, title = "AI observation"): FindingEvidenceRef {
  return {
    id: runId,
    kind: "ai",
    label: title,
    createdAt: nowIso(),
    metadata: {}
  };
}

export function findingFromAgentFinding(runId: string, input: AgentFinding): Finding | null {
  const createdAt = input.createdAt || nowIso();
  const evidence = [
    ...input.evidenceRefs
      .map((ref) => normalizeFindingEvidenceRef(ref, createdAt))
      .filter((ref): ref is FindingEvidenceRef => Boolean(ref)),
    evidenceRefFromAi(runId, `AI run ${runId}`)
  ];
  return normalizeFinding(
    {
      id: input.id,
      title: input.title,
      severity: "medium",
      confidence: input.confidence,
      status: "draft",
      evidence,
      notes: [input.notes, ...input.uncertainties].filter(Boolean).join("\n"),
      source: "ai",
      sourceId: runId,
      createdAt,
      updatedAt: createdAt
    },
    createdAt
  );
}

export function upsertFinding(findings: Finding[], finding: Finding) {
  const normalized = normalizeFinding({ ...finding, updatedAt: nowIso() });
  if (!normalized) {
    return findings;
  }
  return [normalized, ...findings.filter((item) => item.id !== normalized.id)].slice(0, MAX_FINDINGS);
}

export function deleteFinding(findings: Finding[], findingId: string) {
  return findings.filter((finding) => finding.id !== findingId);
}

function markdownEscape(value: string) {
  return value.replace(/\r/g, "").trim();
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function evidenceLine(ref: FindingEvidenceRef, raw: boolean) {
  const metadata = Object.entries(ref.metadata)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${raw ? value : redactEvidenceValue(value)}`)
    .join(", ");
  return metadata ? `${ref.kind}:${ref.id} - ${ref.label} (${metadata})` : `${ref.kind}:${ref.id} - ${ref.label}`;
}

function redactEvidenceValue(value: string) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (/token|secret|password|cookie|authorization|bearer/i.test(text)) {
    return "[redacted]";
  }
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function findingMarkdown(finding: Finding, raw: boolean) {
  const lines = [
    `## ${markdownEscape(finding.title)}`,
    "",
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    `Status: ${finding.status}`,
    finding.owner ? `Owner: ${markdownEscape(finding.owner)}` : "",
    finding.affectedAssets.length ? `Affected assets: ${finding.affectedAssets.join(", ")}` : "",
    "",
    "### Evidence",
    ...finding.evidence.map((ref) => `- ${markdownEscape(evidenceLine(ref, raw))}`),
    "",
    "### Reproduction",
    markdownEscape(finding.reproductionSteps || "Not documented."),
    "",
    "### Impact",
    markdownEscape(finding.impact || "Not documented."),
    "",
    "### Remediation",
    markdownEscape(finding.remediation || "Not documented."),
    finding.retestResult ? "\n### Retest\n" + markdownEscape(finding.retestResult) : "",
    finding.notes ? "\n### Notes\n" + markdownEscape(finding.notes) : ""
  ];
  return lines.filter((line, index, array) => line || array[index - 1] !== "").join("\n");
}

function appendixMarkdown(findings: Finding[], raw: boolean) {
  const refs = new Map<string, FindingEvidenceRef>();
  for (const finding of findings) {
    for (const ref of finding.evidence) {
      refs.set(evidenceRefKey(ref), ref);
    }
  }
  if (refs.size === 0) {
    return "";
  }
  return [
    "# Evidence Appendix",
    "",
    ...Array.from(refs.values()).map((ref) => `- ${markdownEscape(evidenceLine(ref, raw))}`)
  ].join("\n");
}

function markdownToHtml(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) {
        return `<h1>${htmlEscape(line.slice(2))}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${htmlEscape(line.slice(3))}</h2>`;
      }
      if (line.startsWith("### ")) {
        return `<h3>${htmlEscape(line.slice(4))}</h3>`;
      }
      if (line.startsWith("- ")) {
        return `<li>${htmlEscape(line.slice(2))}</li>`;
      }
      return line ? `<p>${htmlEscape(line)}</p>` : "";
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>\n${match}</ul>\n`);
}

export function buildFindingReport(
  findings: Finding[],
  options: Partial<FindingReportOptions> = {},
  title = "Radar Findings Report"
): FindingReport {
  const reportOptions: FindingReportOptions = {
    format: options.format || "markdown",
    includeDrafts: Boolean(options.includeDrafts),
    includeAppendix: options.includeAppendix !== false,
    includeRawEvidence: Boolean(options.includeRawEvidence)
  };
  const generatedAt = nowIso();
  const included = findings.filter((finding) => reportOptions.includeDrafts || finding.status !== "draft");
  const bodyMarkdown = [
    `# ${title}`,
    "",
    `Generated: ${generatedAt}`,
    `Findings: ${included.length}`,
    "",
    ...included.map((finding) => findingMarkdown(finding, reportOptions.includeRawEvidence)),
    reportOptions.includeAppendix ? appendixMarkdown(included, reportOptions.includeRawEvidence) : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    format: reportOptions.format,
    title,
    generatedAt,
    findingCount: included.length,
    body: reportOptions.format === "html" ? markdownToHtml(bodyMarkdown) : bodyMarkdown
  };
}
