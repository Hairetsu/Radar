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
  FindingReportPreset,
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
const findingStatuses = [
  "draft",
  "needs-evidence",
  "reviewed",
  "accepted-risk",
  "fixed-pending-retest",
  "retest-passed",
  "retest-failed"
] as const;
const findingEvidenceKinds = ["capture", "websocket", "replay", "automate", "workflow", "ai"] as const;

export type FindingFilters = {
  status?: string;
  severity?: string;
  owner?: string;
  component?: string;
  text?: string;
};

export type FindingMergeSuggestion = {
  id: string;
  primaryId: string;
  duplicateId: string;
  score: number;
  reasons: string[];
};

export type RetestMatrixRow = {
  id: string;
  title: string;
  severity: FindingSeverity;
  component: string;
  owner: string;
  status: (typeof findingStatuses)[number];
  retestState: "not-ready" | "pending" | "passed" | "failed" | "accepted-risk";
  evidenceCount: number;
  updatedAt: string;
};

export const FINDING_REPORT_PRESETS: Record<FindingReportPreset, FindingReportOptions> = {
  "internal-notes": {
    format: "markdown",
    preset: "internal-notes",
    title: "Radar Internal Notes",
    includeDrafts: true,
    includeAppendix: true,
    includeRawEvidence: false,
    includeRetestMatrix: true
  },
  "client-report": {
    format: "markdown",
    preset: "client-report",
    title: "Radar Client Report",
    includeDrafts: false,
    includeAppendix: true,
    includeRawEvidence: false,
    includeRetestMatrix: true
  },
  "raw-technical-appendix": {
    format: "markdown",
    preset: "raw-technical-appendix",
    title: "Radar Raw Technical Appendix",
    includeDrafts: true,
    includeAppendix: true,
    includeRawEvidence: true,
    includeRetestMatrix: true
  }
};

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
    component: cleanLine(record.component),
    affectedAssets: cleanStringList(record.affectedAssets),
    evidence: uniqueEvidence,
    reproductionSteps: cleanText(record.reproductionSteps),
    impact: cleanText(record.impact),
    remediation: cleanText(record.remediation),
    notes: cleanText(record.notes),
    owner: cleanLine(record.owner),
    assignee: cleanLine(record.assignee),
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
    component: "",
    affectedAssets: [],
    evidence: evidence.slice(0, MAX_FINDING_EVIDENCE),
    reproductionSteps: "",
    impact: template.impact,
    remediation: template.remediation,
    notes: "",
    owner: "",
    assignee: "",
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
      affectedAssets: input.affectedAssets,
      evidence,
      reproductionSteps: input.reproductionNotes,
      remediation: input.remediation,
      impact: input.severityRationale,
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

function normalizedSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function filterFindings(findings: Finding[], filters: FindingFilters = {}) {
  const status = normalizedSearchText(filters.status || "all");
  const severity = normalizedSearchText(filters.severity || "all");
  const owner = normalizedSearchText(filters.owner || "");
  const component = normalizedSearchText(filters.component || "");
  const text = normalizedSearchText(filters.text || "");
  return findings.filter((finding) => {
    if (status && status !== "all" && finding.status !== status) {
      return false;
    }
    if (severity && severity !== "all" && finding.severity !== severity) {
      return false;
    }
    if (owner && !normalizedSearchText(`${finding.owner} ${finding.assignee}`).includes(owner)) {
      return false;
    }
    if (component && !normalizedSearchText(finding.component).includes(component)) {
      return false;
    }
    if (!text) {
      return true;
    }
    return normalizedSearchText(
      [
        finding.title,
        finding.component,
        finding.owner,
        finding.assignee,
        finding.affectedAssets.join(" "),
        finding.reproductionSteps,
        finding.impact,
        finding.remediation,
        finding.notes,
        finding.evidence.map((ref) => `${ref.kind}:${ref.id} ${ref.label}`).join(" ")
      ].join(" ")
    ).includes(text);
  });
}

function overlapScore(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normalizedSearchText).filter(Boolean));
  const rightSet = new Set(right.map(normalizedSearchText).filter(Boolean));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftSet.size, rightSet.size);
}

function titleWords(value: string) {
  return normalizedSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
    .slice(0, 16);
}

export function suggestFindingMerges(findings: Finding[], limit = 12): FindingMergeSuggestion[] {
  const suggestions: FindingMergeSuggestion[] = [];
  for (let leftIndex = 0; leftIndex < findings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < findings.length; rightIndex += 1) {
      const left = findings[leftIndex];
      const right = findings[rightIndex];
      const reasons: string[] = [];
      let score = 0;

      if (left.templateId && left.templateId === right.templateId) {
        score += 24;
        reasons.push(`same template ${left.templateId}`);
      }
      if (left.component && left.component === right.component) {
        score += 16;
        reasons.push(`same component ${left.component}`);
      }
      if (left.severity === right.severity) {
        score += 8;
        reasons.push(`same severity ${left.severity}`);
      }
      const assetOverlap = overlapScore(left.affectedAssets, right.affectedAssets);
      if (assetOverlap > 0) {
        score += Math.round(assetOverlap * 24);
        reasons.push("overlapping assets");
      }
      const evidenceOverlap = overlapScore(
        left.evidence.map(evidenceRefKey),
        right.evidence.map(evidenceRefKey)
      );
      if (evidenceOverlap > 0) {
        score += Math.round(evidenceOverlap * 30);
        reasons.push("shared evidence");
      }
      const titleOverlap = overlapScore(titleWords(left.title), titleWords(right.title));
      if (titleOverlap >= 0.35) {
        score += Math.round(titleOverlap * 20);
        reasons.push("similar title");
      }

      if (score >= 32) {
        const primary = left.updatedAt >= right.updatedAt ? left : right;
        const duplicate = primary.id === left.id ? right : left;
        suggestions.push({
          id: `${primary.id}:${duplicate.id}`,
          primaryId: primary.id,
          duplicateId: duplicate.id,
          score,
          reasons
        });
      }
    }
  }
  return suggestions
    .sort((left, right) => right.score - left.score || left.primaryId.localeCompare(right.primaryId))
    .slice(0, limit);
}

function joinUniqueLines(...values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value || "").split(/\n+/))
        .map((line) => line.trim())
        .filter(Boolean)
    )
  ).join("\n");
}

export function mergeFindings(primary: Finding, duplicate: Finding, mergedAt = nowIso()): Finding {
  const evidence = Array.from(
    new Map([...primary.evidence, ...duplicate.evidence].map((ref) => [evidenceRefKey(ref), ref])).values()
  ).slice(0, MAX_FINDING_EVIDENCE);
  const severity = findingSeverities.indexOf(duplicate.severity) > findingSeverities.indexOf(primary.severity)
    ? duplicate.severity
    : primary.severity;
  const confidence = findingConfidences.indexOf(duplicate.confidence) > findingConfidences.indexOf(primary.confidence)
    ? duplicate.confidence
    : primary.confidence;
  const merged = normalizeFinding(
    {
      ...primary,
      severity,
      confidence,
      component: primary.component || duplicate.component,
      affectedAssets: Array.from(new Set([...primary.affectedAssets, ...duplicate.affectedAssets])),
      evidence,
      reproductionSteps: joinUniqueLines(primary.reproductionSteps, duplicate.reproductionSteps),
      impact: joinUniqueLines(primary.impact, duplicate.impact),
      remediation: joinUniqueLines(primary.remediation, duplicate.remediation),
      notes: joinUniqueLines(primary.notes, duplicate.notes, `Merged duplicate finding ${duplicate.id} on ${mergedAt}.`),
      owner: primary.owner || duplicate.owner,
      assignee: primary.assignee || duplicate.assignee,
      retestResult: joinUniqueLines(primary.retestResult, duplicate.retestResult),
      updatedAt: mergedAt
    },
    primary.createdAt
  );
  return merged || { ...primary, updatedAt: mergedAt };
}

export function buildRetestMatrix(findings: Finding[]): RetestMatrixRow[] {
  return findings.map((finding) => {
    const retestState: RetestMatrixRow["retestState"] =
      finding.status === "retest-passed"
        ? "passed"
        : finding.status === "retest-failed"
          ? "failed"
          : finding.status === "accepted-risk"
            ? "accepted-risk"
            : finding.status === "fixed-pending-retest"
              ? "pending"
              : finding.evidence.length > 0
                ? "not-ready"
                : "not-ready";
    return {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      component: finding.component,
      owner: finding.owner || finding.assignee,
      status: finding.status,
      retestState,
      evidenceCount: finding.evidence.length,
      updatedAt: finding.updatedAt
    };
  });
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
    finding.component ? `Component: ${markdownEscape(finding.component)}` : "",
    finding.owner ? `Owner: ${markdownEscape(finding.owner)}` : "",
    finding.assignee ? `Assignee: ${markdownEscape(finding.assignee)}` : "",
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

function markdownSection(title: string, body?: string) {
  const text = markdownEscape(body || "");
  if (!text) {
    return "";
  }
  return [`# ${title}`, "", text].join("\n");
}

function retestMatrixMarkdown(findings: Finding[]) {
  const rows = buildRetestMatrix(findings);
  if (rows.length === 0) {
    return "";
  }
  return [
    "# Retest Matrix",
    "",
    "| Finding | Severity | Component | Owner | Status | Retest | Evidence | Updated |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      [
        markdownEscape(row.title).replace(/\|/g, "\\|"),
        row.severity,
        markdownEscape(row.component || "-").replace(/\|/g, "\\|"),
        markdownEscape(row.owner || "-").replace(/\|/g, "\\|"),
        row.status,
        row.retestState,
        String(row.evidenceCount),
        row.updatedAt
      ].join(" | ")
    )
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
      if (line.startsWith("| ")) {
        return `<pre>${htmlEscape(line)}</pre>`;
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
  const preset = options.preset ? FINDING_REPORT_PRESETS[options.preset] : undefined;
  const reportOptions: FindingReportOptions = {
    ...(preset || FINDING_REPORT_PRESETS["client-report"]),
    ...options,
    format: options.format || preset?.format || "markdown",
    title: options.title || preset?.title || title,
    includeDrafts: options.includeDrafts ?? Boolean(preset?.includeDrafts),
    includeAppendix: options.includeAppendix ?? preset?.includeAppendix ?? true,
    includeRawEvidence: options.includeRawEvidence ?? Boolean(preset?.includeRawEvidence),
    includeRetestMatrix: options.includeRetestMatrix ?? preset?.includeRetestMatrix ?? true
  };
  const generatedAt = nowIso();
  const selectedIds = new Set(reportOptions.findingIds || []);
  const included = findings.filter((finding) => {
    if (selectedIds.size > 0 && !selectedIds.has(finding.id)) {
      return false;
    }
    return reportOptions.includeDrafts || finding.status !== "draft";
  });
  const validationWarnings =
    reportOptions.preset === "client-report"
      ? included.flatMap((finding) => {
          const warnings: string[] = [];
          if (finding.evidence.length === 0) {
            warnings.push(`${finding.title}: missing evidence`);
          }
          if (!finding.reproductionSteps.trim()) {
            warnings.push(`${finding.title}: missing reproduction`);
          }
          if (!finding.impact.trim()) {
            warnings.push(`${finding.title}: missing impact`);
          }
          if (!finding.remediation.trim()) {
            warnings.push(`${finding.title}: missing remediation`);
          }
          return warnings;
        })
      : [];
  const bodyMarkdown = [
    `# ${reportOptions.title || title}`,
    "",
    `Generated: ${generatedAt}`,
    `Findings: ${included.length}`,
    reportOptions.preset ? `Preset: ${reportOptions.preset}` : "",
    validationWarnings.length > 0 ? `Validation warnings: ${validationWarnings.length}` : "",
    "",
    markdownSection("Executive Summary", reportOptions.executiveSummary),
    markdownSection("Methodology", reportOptions.methodology),
    markdownSection("Scope", reportOptions.scopeSummary),
    markdownSection("Limitations", reportOptions.limitations),
    ...included.map((finding) => findingMarkdown(finding, reportOptions.includeRawEvidence)),
    reportOptions.includeRetestMatrix ? retestMatrixMarkdown(included) : "",
    markdownSection("Change Log", reportOptions.changeLog),
    reportOptions.includeAppendix ? appendixMarkdown(included, reportOptions.includeRawEvidence) : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    format: reportOptions.format,
    title: reportOptions.title || title,
    generatedAt,
    findingCount: included.length,
    body: reportOptions.format === "html" ? markdownToHtml(bodyMarkdown) : bodyMarkdown,
    validationWarnings
  };
}
