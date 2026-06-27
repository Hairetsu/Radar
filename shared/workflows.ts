import type {
  CapturedRequest,
  Finding,
  FindingEvidenceRef,
  FindingTemplateId,
  ReplayDraft,
  ReplayResult,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowDiffEntry,
  WorkflowDryRun,
  WorkflowGraph,
  WorkflowInput,
  WorkflowMode,
  WorkflowRevision,
  WorkflowResult,
  WorkflowRun,
  WorkflowRunSource,
  WorkflowScopePolicy,
  WorkflowStep,
  WorkflowStepTemplate,
  WorkflowStepKind,
  WorkflowValidationIssue
} from "./domain.js";
import { isAllowedTarget } from "./allowlist.js";
import { normalizeFinding } from "./findings.js";
import { truncateText } from "./text.js";

export const MAX_WORKFLOWS = 120;
export const MAX_WORKFLOW_STEPS = 24;
export const MAX_WORKFLOW_INPUTS = 24;
export const MAX_WORKFLOW_RESULTS = 200;
export const MAX_WORKFLOW_REQUESTS = 12;
export const MAX_WORKFLOW_TIMEOUT_MS = 30_000;
export const MAX_WORKFLOW_DELAY_MS = 5_000;

const BUILT_IN_CREATED_AT = "2026-01-01T00:00:00.000Z";
const workflowModes = ["passive", "active"] as const;
const workflowInputTypes = ["text", "number", "boolean", "capture-id"] as const;
const workflowStepKinds = [
  "security-headers",
  "cookie-flags",
  "cors-policy",
  "cache-control",
  "metadata-exposure",
  "active-replay",
  "browser-open"
] as const;

export const WORKFLOW_STEP_TEMPLATES: WorkflowStepTemplate[] = [
  {
    id: "security-headers",
    title: "Security Headers",
    description: "Inspect scoped responses for missing browser hardening headers.",
    step: { id: "headers", title: "Security header coverage", kind: "security-headers", config: {} }
  },
  {
    id: "cookie-flags",
    title: "Cookie Flags",
    description: "Check Set-Cookie directives for Secure, HttpOnly, and SameSite.",
    step: { id: "cookies", title: "Cookie flag coverage", kind: "cookie-flags", config: {} }
  },
  {
    id: "cors-policy",
    title: "CORS Policy",
    description: "Find wildcard, credentialed, or reflective CORS behavior.",
    step: { id: "cors", title: "CORS policy", kind: "cors-policy", config: {} }
  },
  {
    id: "cache-control",
    title: "Sensitive Cache Control",
    description: "Review sensitive responses for defensive cache directives.",
    step: { id: "cache", title: "Sensitive cache control", kind: "cache-control", config: {} }
  },
  {
    id: "metadata-exposure",
    title: "Metadata Exposure",
    description: "Detect technology headers, debug content, and secret-shaped responses.",
    step: { id: "metadata", title: "Metadata exposure", kind: "metadata-exposure", config: {} }
  },
  {
    id: "active-replay",
    title: "Active Replay",
    description: "Replay a selected capture through Radar's scoped active caps.",
    step: { id: "replay", title: "Scoped active replay", kind: "active-replay", config: { stripAuth: "true" } }
  },
  {
    id: "browser-open",
    title: "Browser Open",
    description: "Open an operator-provided URL in the embedded browser.",
    step: { id: "open", title: "Open browser target", kind: "browser-open", config: { urlInput: "url" } }
  }
];

const defaultPassiveScope: WorkflowScopePolicy = {
  requireInScope: true,
  allowActive: false,
  maxRequests: 0,
  timeoutMs: 10_000,
  delayMs: 0,
  maxResults: 80
};

const defaultActiveScope: WorkflowScopePolicy = {
  requireInScope: true,
  allowActive: true,
  maxRequests: 1,
  timeoutMs: 10_000,
  delayMs: 0,
  maxResults: 40
};

type WorkflowRunInput = {
  definition: WorkflowDefinition;
  sessionId: string;
  source?: WorkflowRunSource;
  inputs?: Record<string, string>;
  status?: WorkflowRun["status"];
  results?: WorkflowResult[];
  error?: string;
  actionCount?: number;
  startedAt?: string;
  completedAt?: string;
};

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
    .slice(0, 180);
}

function cleanText(value: unknown) {
  return truncateText(String(value || "").trim(), 4000);
}

function cleanId(value: unknown, fallback: string) {
  return cleanLine(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(String(value) as T[number]) ? (String(value) as T[number]) : fallback;
}

function headerValue(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
  return entry ? entry[1] : "";
}

function responseHeader(capture: CapturedRequest, name: string) {
  return headerValue(capture.responseHeaders, name);
}

function requestHeader(capture: CapturedRequest, name: string) {
  return headerValue(capture.requestHeaders, name);
}

function hasResponseHeader(capture: CapturedRequest, name: string) {
  return Boolean(responseHeader(capture, name));
}

function evidenceRefFromCapture(capture: CapturedRequest): FindingEvidenceRef {
  return {
    id: capture.id,
    kind: "capture",
    label: `${capture.method} ${capture.url}`,
    createdAt: capture.startedAt,
    metadata: {
      status: capture.status ? String(capture.status) : "pending",
      host: capture.host,
      path: capture.path
    }
  };
}

export function workflowEvidenceRef(run: WorkflowRun, result: WorkflowResult): FindingEvidenceRef {
  return {
    id: `${run.id}:${result.id}`,
    kind: "workflow",
    label: `${run.workflowName} / ${result.stepTitle}`,
    createdAt: result.createdAt,
    metadata: {
      workflowId: run.workflowId,
      runId: run.id,
      resultId: result.id,
      level: result.level
    }
  };
}

function normalizeScopePolicy(value: unknown, mode: WorkflowMode): WorkflowScopePolicy {
  const input = objectValue(value);
  const fallback = mode === "active" ? defaultActiveScope : defaultPassiveScope;
  return {
    requireInScope: input.requireInScope === false ? false : fallback.requireInScope,
    allowActive: input.allowActive === true,
    maxRequests: clampNumber(input.maxRequests, fallback.maxRequests, 0, MAX_WORKFLOW_REQUESTS),
    timeoutMs: clampNumber(input.timeoutMs, fallback.timeoutMs, 1_000, MAX_WORKFLOW_TIMEOUT_MS),
    delayMs: clampNumber(input.delayMs, fallback.delayMs, 0, MAX_WORKFLOW_DELAY_MS),
    maxResults: clampNumber(input.maxResults, fallback.maxResults, 1, MAX_WORKFLOW_RESULTS)
  };
}

function normalizeCondition(value: unknown): WorkflowCondition | undefined {
  const input = objectValue(value);
  const inputId = cleanId(input.inputId, "");
  if (!inputId) {
    return undefined;
  }
  return {
    inputId,
    equals: cleanLine(input.equals)
  };
}

function normalizeInput(value: unknown, index: number): WorkflowInput | null {
  const input = objectValue(value);
  const id = cleanId(input.id, `input-${index + 1}`);
  const label = cleanLine(input.label, id);
  return {
    id,
    label,
    type: normalizeEnum(input.type, workflowInputTypes, "text"),
    required: input.required === true,
    defaultValue: cleanLine(input.defaultValue)
  };
}

function normalizeStep(value: unknown, index: number): WorkflowStep | null {
  const input = objectValue(value);
  const kind = normalizeEnum(input.kind, workflowStepKinds, "" as WorkflowStepKind);
  if (!kind) {
    return null;
  }
  const config = objectValue(input.config);
  return {
    id: cleanId(input.id, `step-${index + 1}`),
    title: cleanLine(input.title, String(kind).replace(/-/g, " ")),
    kind,
    condition: normalizeCondition(input.condition),
    config: Object.fromEntries(
      Object.entries(config)
        .map(([key, entry]) => [cleanId(key, ""), cleanLine(entry)])
        .filter(([key]) => Boolean(key))
        .slice(0, 24)
    )
  };
}

export function normalizeWorkflowDefinition(input: unknown, createdAt = nowIso()): WorkflowDefinition | null {
  const value = objectValue(input);
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps = rawSteps
    .map((step, index) => normalizeStep(step, index))
    .filter((step): step is WorkflowStep => Boolean(step))
    .slice(0, MAX_WORKFLOW_STEPS);
  if (steps.length === 0) {
    return null;
  }
  const hasActiveStep = steps.some((step) => step.kind === "active-replay" || step.kind === "browser-open");
  const mode = hasActiveStep ? "active" : normalizeEnum(value.mode, workflowModes, "passive");
  const scope = normalizeScopePolicy(value.scope, mode);
  if (hasActiveStep && !scope.allowActive) {
    return null;
  }
  const id = cleanId(value.id, createId("workflow"));
  const inputs = (Array.isArray(value.inputs) ? value.inputs : [])
    .map((entry, index) => normalizeInput(entry, index))
    .filter((entry): entry is WorkflowInput => Boolean(entry))
    .slice(0, MAX_WORKFLOW_INPUTS);
  return {
    id,
    name: cleanLine(value.name, id),
    description: cleanText(value.description),
    mode,
    builtIn: value.builtIn === true,
    inputs,
    scope,
    steps,
    createdAt: cleanLine(value.createdAt, createdAt),
    updatedAt: cleanLine(value.updatedAt, createdAt)
  };
}

export function normalizeWorkflowDefinitions(input: unknown): WorkflowDefinition[] {
  const values = Array.isArray(input) ? input : [];
  return values
    .map((entry) => normalizeWorkflowDefinition(entry))
    .filter((entry): entry is WorkflowDefinition => Boolean(entry))
    .slice(0, MAX_WORKFLOWS);
}

function parseScalar(value: string): string | boolean | number {
  const text = value.trim().replace(/^["']|["']$/g, "");
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }
  return text;
}

function parseYamlLikeDefinition(text: string) {
  const root: Record<string, unknown> = {};
  const steps: Record<string, unknown>[] = [];
  const inputs: Record<string, unknown>[] = [];
  let activeList: "steps" | "inputs" | "" = "";
  let activeItem: Record<string, unknown> | null = null;
  let activeNested = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed === "steps:") {
      activeList = "steps";
      activeItem = null;
      activeNested = "";
      root.steps = steps;
      continue;
    }
    if (trimmed === "inputs:") {
      activeList = "inputs";
      activeItem = null;
      activeNested = "";
      root.inputs = inputs;
      continue;
    }
    if (trimmed === "scope:") {
      activeList = "";
      activeItem = root;
      activeNested = "scope";
      root.scope = objectValue(root.scope);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      activeItem = {};
      activeNested = "";
      if (activeList === "steps") {
        steps.push(activeItem);
      } else if (activeList === "inputs") {
        inputs.push(activeItem);
      }
      const rest = trimmed.slice(2).trim();
      const separator = rest.indexOf(":");
      if (separator > 0) {
        activeItem[rest.slice(0, separator).trim()] = parseScalar(rest.slice(separator + 1));
      }
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = parseScalar(trimmed.slice(separator + 1));
    if (activeItem && activeList && line.startsWith("    ")) {
      activeItem[key] = value;
    } else if (activeNested === "scope" && line.startsWith("  ")) {
      root.scope = { ...objectValue(root.scope), [key]: value };
    } else {
      activeList = "";
      activeItem = null;
      activeNested = "";
      root[key] = value;
    }
  }
  return root;
}

export function parseWorkflowDefinition(text: string): WorkflowDefinition | null {
  const source = String(text || "").trim();
  if (!source) {
    return null;
  }
  try {
    return normalizeWorkflowDefinition(JSON.parse(source));
  } catch {
    return normalizeWorkflowDefinition(parseYamlLikeDefinition(source));
  }
}

function builtIn(input: Omit<WorkflowDefinition, "createdAt" | "updatedAt">): WorkflowDefinition {
  const normalized = normalizeWorkflowDefinition(
    {
      ...input,
      builtIn: true,
      createdAt: BUILT_IN_CREATED_AT,
      updatedAt: BUILT_IN_CREATED_AT
    },
    BUILT_IN_CREATED_AT
  );
  if (!normalized) {
    throw new Error(`Built-in workflow failed to normalize: ${input.id}`);
  }
  return normalized;
}

export const BUILT_IN_WORKFLOWS: WorkflowDefinition[] = [
  builtIn({
    id: "builtin-security-headers",
    name: "Security Headers",
    description: "Checks scoped responses for browser hardening headers.",
    mode: "passive",
    builtIn: true,
    inputs: [],
    scope: defaultPassiveScope,
    steps: [{ id: "headers", title: "Security header coverage", kind: "security-headers", config: {} }]
  }),
  builtIn({
    id: "builtin-cookie-flags",
    name: "Cookie Flags",
    description: "Reviews Set-Cookie directives for Secure, HttpOnly, and SameSite coverage.",
    mode: "passive",
    builtIn: true,
    inputs: [],
    scope: defaultPassiveScope,
    steps: [{ id: "cookies", title: "Cookie flag coverage", kind: "cookie-flags", config: {} }]
  }),
  builtIn({
    id: "builtin-cors-cache",
    name: "CORS And Cache Control",
    description: "Checks permissive CORS responses and sensitive response cache directives.",
    mode: "passive",
    builtIn: true,
    inputs: [],
    scope: defaultPassiveScope,
    steps: [
      { id: "cors", title: "CORS policy", kind: "cors-policy", config: {} },
      { id: "cache", title: "Sensitive cache control", kind: "cache-control", config: {} }
    ]
  }),
  builtIn({
    id: "builtin-metadata-exposure",
    name: "Metadata Exposure",
    description: "Looks for technology headers, debug bodies, stack traces, and secret-shaped response content.",
    mode: "passive",
    builtIn: true,
    inputs: [],
    scope: defaultPassiveScope,
    steps: [{ id: "metadata", title: "Metadata exposure", kind: "metadata-exposure", config: {} }]
  }),
  builtIn({
    id: "builtin-auth-state-check",
    name: "Unauthenticated Access Check",
    description: "Replays a selected capture once with credentials stripped and compares the response class.",
    mode: "active",
    builtIn: true,
    inputs: [
      {
        id: "capture-id",
        label: "Capture ID",
        type: "capture-id",
        required: true,
        defaultValue: ""
      }
    ],
    scope: defaultActiveScope,
    steps: [
      {
        id: "strip-auth-replay",
        title: "Replay without ambient credentials",
        kind: "active-replay",
        config: { stripAuth: "true" }
      }
    ]
  })
];

export function allWorkflows(saved: WorkflowDefinition[]) {
  const savedById = new Map(saved.map((workflow) => [workflow.id, workflow]));
  return [...BUILT_IN_WORKFLOWS, ...saved.filter((workflow) => !workflow.builtIn && !savedById.has(`builtin-${workflow.id}`))];
}

export function shouldRunWorkflowStep(step: WorkflowStep, inputs: Record<string, string>) {
  if (!step.condition) {
    return true;
  }
  return inputs[step.condition.inputId] === step.condition.equals;
}

export function isActiveWorkflowStep(step: WorkflowStep) {
  return step.kind === "active-replay" || step.kind === "browser-open";
}

export function workflowToGraph(definition: WorkflowDefinition | null): WorkflowGraph {
  if (!definition) {
    return { nodes: [], edges: [] };
  }
  const nodes = definition.steps.map((step) => ({
    id: step.id,
    title: step.title,
    kind: step.kind,
    active: isActiveWorkflowStep(step),
    condition: step.condition
  }));
  return {
    nodes,
    edges: definition.steps.slice(1).map((step, index) => ({
      from: definition.steps[index].id,
      to: step.id,
      label: step.condition ? `if ${step.condition.inputId} = ${step.condition.equals}` : "then"
    }))
  };
}

export function workflowTemplateById(templateId: string) {
  return WORKFLOW_STEP_TEMPLATES.find((template) => template.id === templateId) || null;
}

function workflowIssue(severity: "error" | "warning", message: string, stepId?: string) {
  return { severity, message, stepId };
}

export function validateWorkflowDraft(input: unknown, inputs: Record<string, string> = {}): WorkflowDryRun {
  const definition = typeof input === "string" ? parseWorkflowDefinition(input) : normalizeWorkflowDefinition(input);
  if (!definition) {
    return {
      ok: false,
      graph: { nodes: [], edges: [] },
      issues: [workflowIssue("error", "Workflow definition is invalid or has no supported steps.")],
      activeStepCount: 0,
      passiveStepCount: 0,
      estimatedRequests: 0,
      skippedStepIds: [],
      runnableStepIds: []
    };
  }
  const issues: WorkflowValidationIssue[] = [];
  const seenStepIds = new Set<string>();
  for (const step of definition.steps) {
    if (seenStepIds.has(step.id)) {
      issues.push(workflowIssue("error", `Duplicate workflow step id: ${step.id}`, step.id));
    }
    seenStepIds.add(step.id);
    if (step.condition && !definition.inputs.some((item) => item.id === step.condition?.inputId)) {
      issues.push(workflowIssue("warning", `Condition references an input that is not declared: ${step.condition.inputId}`, step.id));
    }
  }
  const activeStepCount = definition.steps.filter(isActiveWorkflowStep).length;
  const passiveStepCount = definition.steps.length - activeStepCount;
  const normalizedInputs = Object.fromEntries(
    definition.inputs.map((item) => [item.id, cleanLine(inputs[item.id], item.defaultValue)])
  );
  for (const item of definition.inputs) {
    if (item.required && !normalizedInputs[item.id]) {
      issues.push(workflowIssue("warning", `Required input is empty for dry run: ${item.label}`));
    }
  }
  const runnableStepIds = definition.steps
    .filter((step) => shouldRunWorkflowStep(step, normalizedInputs))
    .map((step) => step.id);
  const skippedStepIds = definition.steps
    .filter((step) => !runnableStepIds.includes(step.id))
    .map((step) => step.id);
  const estimatedRequests = definition.steps
    .filter((step) => runnableStepIds.includes(step.id) && isActiveWorkflowStep(step))
    .length;
  if (estimatedRequests > 0 && !definition.scope.allowActive) {
    issues.push(workflowIssue("error", "Active steps require scope.allowActive to be true."));
  }
  if (estimatedRequests > definition.scope.maxRequests) {
    issues.push(workflowIssue("error", `Dry run estimates ${estimatedRequests} active requests, above cap ${definition.scope.maxRequests}.`));
  }
  if (definition.mode === "passive" && activeStepCount > 0) {
    issues.push(workflowIssue("warning", "Workflow mode will be treated as active because it contains active steps."));
  }
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    workflow: definition,
    graph: workflowToGraph(definition),
    issues,
    activeStepCount,
    passiveStepCount,
    estimatedRequests,
    skippedStepIds,
    runnableStepIds
  };
}

function fieldDiff(kind: WorkflowDiffEntry["kind"], field: string, before?: unknown, after?: unknown): WorkflowDiffEntry {
  return {
    kind,
    field,
    before: before === undefined ? undefined : cleanLine(before),
    after: after === undefined ? undefined : cleanLine(after)
  };
}

export function diffWorkflowDefinitions(before: WorkflowDefinition | null | undefined, after: WorkflowDefinition): WorkflowDiffEntry[] {
  if (!before) {
    return [fieldDiff("added", "workflow", undefined, after.name)];
  }
  const diffs: WorkflowDiffEntry[] = [];
  for (const field of ["name", "description", "mode"] as const) {
    if (before[field] !== after[field]) {
      diffs.push(fieldDiff("changed", field, before[field], after[field]));
    }
  }
  for (const field of ["maxRequests", "timeoutMs", "delayMs", "maxResults", "allowActive", "requireInScope"] as const) {
    if (before.scope[field] !== after.scope[field]) {
      diffs.push(fieldDiff("changed", `scope.${field}`, before.scope[field], after.scope[field]));
    }
  }
  const beforeInputs = new Map(before.inputs.map((input) => [input.id, input]));
  const afterInputs = new Map(after.inputs.map((input) => [input.id, input]));
  for (const input of before.inputs) {
    if (!afterInputs.has(input.id)) {
      diffs.push(fieldDiff("removed", `inputs.${input.id}`, input.label));
    }
  }
  for (const input of after.inputs) {
    const previous = beforeInputs.get(input.id);
    if (!previous) {
      diffs.push(fieldDiff("added", `inputs.${input.id}`, undefined, input.label));
    } else if (JSON.stringify(previous) !== JSON.stringify(input)) {
      diffs.push(fieldDiff("changed", `inputs.${input.id}`, previous.label, input.label));
    }
  }
  const beforeSteps = new Map(before.steps.map((step) => [step.id, step]));
  const afterSteps = new Map(after.steps.map((step) => [step.id, step]));
  for (const step of before.steps) {
    if (!afterSteps.has(step.id)) {
      diffs.push(fieldDiff("removed", `steps.${step.id}`, step.title));
    }
  }
  for (const step of after.steps) {
    const previous = beforeSteps.get(step.id);
    if (!previous) {
      diffs.push(fieldDiff("added", `steps.${step.id}`, undefined, step.title));
    } else if (JSON.stringify(previous) !== JSON.stringify(step)) {
      diffs.push(fieldDiff("changed", `steps.${step.id}`, `${previous.kind}:${previous.title}`, `${step.kind}:${step.title}`));
    }
  }
  return diffs;
}

export function createWorkflowRevision(
  workflow: WorkflowDefinition,
  previous?: WorkflowDefinition | null,
  savedAt = nowIso()
): WorkflowRevision {
  const diff = diffWorkflowDefinitions(previous, workflow);
  return {
    id: createId("workflow_revision"),
    workflowId: workflow.id,
    workflowName: workflow.name,
    savedAt,
    summary: previous ? `${diff.length} changes saved` : "Initial workflow version saved",
    diff,
    workflow
  };
}

export function normalizeWorkflowInputs(definition: WorkflowDefinition, input: Record<string, unknown> = {}) {
  const values: Record<string, string> = {};
  for (const item of definition.inputs) {
    const value = cleanLine(input[item.id], item.defaultValue);
    if (item.required && !value) {
      throw new Error(`Workflow input is required: ${item.label}`);
    }
    values[item.id] = value;
  }
  for (const [key, value] of Object.entries(input)) {
    const id = cleanId(key, "");
    if (id && !(id in values)) {
      values[id] = cleanLine(value);
    }
  }
  return values;
}

function result(input: {
  step: WorkflowStep;
  level: WorkflowResult["level"];
  title: string;
  message: string;
  evidence?: FindingEvidenceRef[];
  details?: Record<string, string>;
  createdAt: string;
}): WorkflowResult {
  return {
    id: createId("workflow_result"),
    stepId: input.step.id,
    stepTitle: input.step.title,
    level: input.level,
    title: cleanLine(input.title),
    message: cleanText(input.message),
    evidence: (input.evidence || []).slice(0, 12),
    details: Object.fromEntries(
      Object.entries(input.details || {})
        .map(([key, value]) => [cleanLine(key), cleanLine(value)])
        .filter(([key, value]) => key && value)
        .slice(0, 20)
    ),
    createdAt: input.createdAt
  };
}

function noEvidenceResult(step: WorkflowStep, createdAt: string) {
  return result({
    step,
    level: "info",
    title: "No matching evidence",
    message: "No scoped captures matched this workflow step.",
    createdAt
  });
}

function securityHeaderResults(step: WorkflowStep, captures: CapturedRequest[], createdAt: string) {
  const requiredBase = ["content-security-policy", "x-content-type-options", "referrer-policy"];
  const findings: WorkflowResult[] = [];
  for (const capture of captures) {
    if (!capture.status || capture.status < 200 || capture.status >= 400) {
      continue;
    }
    const required = capture.url.startsWith("https://") ? ["strict-transport-security", ...requiredBase] : requiredBase;
    const missing = required.filter((header) => !hasResponseHeader(capture, header));
    const hasFrameControl =
      hasResponseHeader(capture, "x-frame-options") || /frame-ancestors/i.test(responseHeader(capture, "content-security-policy"));
    if (!hasFrameControl) {
      missing.push("x-frame-options|csp-frame-ancestors");
    }
    if (missing.length > 0) {
      findings.push(
        result({
          step,
          level: "warn",
          title: "Missing security headers",
          message: `${capture.url} is missing ${missing.join(", ")}.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { missing: missing.join(", "), status: String(capture.status) },
          createdAt
        })
      );
    }
  }
  if (findings.length === 0) {
    return captures.length > 0
      ? [
          result({
            step,
            level: "pass",
            title: "Security headers present",
            message: "No missing security-header coverage was detected in scoped successful responses.",
            evidence: captures.slice(0, 4).map(evidenceRefFromCapture),
            createdAt
          })
        ]
      : [noEvidenceResult(step, createdAt)];
  }
  return findings;
}

function splitSetCookie(value: string) {
  return value
    .split(/,(?=\s*[^;,\s]+=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function cookieFlagResults(step: WorkflowStep, captures: CapturedRequest[], createdAt: string) {
  const findings: WorkflowResult[] = [];
  for (const capture of captures) {
    const header = responseHeader(capture, "set-cookie");
    if (!header) {
      continue;
    }
    for (const cookie of splitSetCookie(header)) {
      const name = cookie.split("=")[0]?.trim() || "cookie";
      const lower = cookie.toLowerCase();
      const missing = [
        capture.url.startsWith("https://") && !lower.includes("; secure") ? "Secure" : "",
        !lower.includes("; httponly") ? "HttpOnly" : "",
        !lower.includes("; samesite") ? "SameSite" : ""
      ].filter(Boolean);
      if (missing.length > 0) {
        findings.push(
          result({
            step,
            level: "warn",
            title: "Cookie missing defensive flags",
            message: `${name} is missing ${missing.join(", ")}.`,
            evidence: [evidenceRefFromCapture(capture)],
            details: { cookie: name, missing: missing.join(", ") },
            createdAt
          })
        );
      }
    }
  }
  if (findings.length === 0) {
    return captures.length > 0
      ? [
          result({
            step,
            level: "pass",
            title: "Cookie flags acceptable",
            message: "No weak Set-Cookie directives were detected in scoped responses.",
            evidence: captures.slice(0, 4).map(evidenceRefFromCapture),
            createdAt
          })
        ]
      : [noEvidenceResult(step, createdAt)];
  }
  return findings;
}

function corsResults(step: WorkflowStep, captures: CapturedRequest[], createdAt: string) {
  const findings: WorkflowResult[] = [];
  for (const capture of captures) {
    const origin = responseHeader(capture, "access-control-allow-origin");
    if (!origin) {
      continue;
    }
    const credentials = responseHeader(capture, "access-control-allow-credentials").toLowerCase() === "true";
    const requestOrigin = requestHeader(capture, "origin");
    if (origin === "*" && credentials) {
      findings.push(
        result({
          step,
          level: "fail",
          title: "Credentialed wildcard CORS",
          message: `${capture.url} allows wildcard origins with credentials.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { origin, credentials: "true" },
          createdAt
        })
      );
    } else if (origin === "*") {
      findings.push(
        result({
          step,
          level: "warn",
          title: "Wildcard CORS origin",
          message: `${capture.url} allows any origin.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { origin },
          createdAt
        })
      );
    } else if (requestOrigin && origin === requestOrigin && !/origin/i.test(responseHeader(capture, "vary"))) {
      findings.push(
        result({
          step,
          level: "warn",
          title: "Reflective CORS without Vary",
          message: `${capture.url} reflects the request Origin without a Vary: Origin response header.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { origin },
          createdAt
        })
      );
    }
  }
  if (findings.length === 0) {
    return captures.length > 0
      ? [
          result({
            step,
            level: "pass",
            title: "No permissive CORS detected",
            message: "Scoped captures did not show wildcard or reflective credentialed CORS behavior.",
            evidence: captures.slice(0, 4).map(evidenceRefFromCapture),
            createdAt
          })
        ]
      : [noEvidenceResult(step, createdAt)];
  }
  return findings;
}

function likelySensitive(capture: CapturedRequest) {
  return (
    /\/(api|admin|account|accounts|me|profile|session|user|users|billing|settings)(\/|$|\?)/i.test(capture.url) ||
    Boolean(requestHeader(capture, "authorization")) ||
    Boolean(requestHeader(capture, "cookie")) ||
    Boolean(responseHeader(capture, "set-cookie"))
  );
}

function cacheResults(step: WorkflowStep, captures: CapturedRequest[], createdAt: string) {
  const findings: WorkflowResult[] = [];
  for (const capture of captures.filter(likelySensitive)) {
    const cache = responseHeader(capture, "cache-control").toLowerCase();
    if (!/(no-store|private|no-cache|max-age=0)/i.test(cache)) {
      findings.push(
        result({
          step,
          level: "warn",
          title: "Sensitive response cache policy is weak",
          message: `${capture.url} looks sensitive but does not declare a defensive Cache-Control policy.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { cacheControl: cache || "missing" },
          createdAt
        })
      );
    }
  }
  if (findings.length === 0) {
    return captures.length > 0
      ? [
          result({
            step,
            level: "pass",
            title: "Cache controls acceptable",
            message: "No weak sensitive-response cache policy was detected.",
            evidence: captures.slice(0, 4).map(evidenceRefFromCapture),
            createdAt
          })
        ]
      : [noEvidenceResult(step, createdAt)];
  }
  return findings;
}

function metadataResults(step: WorkflowStep, captures: CapturedRequest[], createdAt: string) {
  const findings: WorkflowResult[] = [];
  for (const capture of captures) {
    const headerFindings = ["server", "x-powered-by", "x-aspnet-version", "x-runtime"]
      .map((name) => [name, responseHeader(capture, name)] as const)
      .filter(([, value]) => Boolean(value));
    if (headerFindings.length > 0) {
      findings.push(
        result({
          step,
          level: "info",
          title: "Technology metadata header exposed",
          message: `${capture.url} exposes ${headerFindings.map(([name]) => name).join(", ")}.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: Object.fromEntries(headerFindings.map(([name, value]) => [name, value])),
          createdAt
        })
      );
    }
    const body = `${capture.responseBody || ""}`.slice(0, 2000);
    if (/(stack trace|traceback|exception|debug mode|aws_access_key_id|begin private key|api[_-]?key|secret=)/i.test(body)) {
      findings.push(
        result({
          step,
          level: "fail",
          title: "Sensitive metadata pattern in response",
          message: `${capture.url} contains a debug, stack-trace, or secret-shaped response pattern.`,
          evidence: [evidenceRefFromCapture(capture)],
          details: { pattern: "debug-or-secret-shaped-content" },
          createdAt
        })
      );
    }
  }
  if (findings.length === 0) {
    return captures.length > 0
      ? [
          result({
            step,
            level: "pass",
            title: "No metadata exposure detected",
            message: "No technology metadata, debug output, or secret-shaped content was detected in scoped captures.",
            evidence: captures.slice(0, 4).map(evidenceRefFromCapture),
            createdAt
          })
        ]
      : [noEvidenceResult(step, createdAt)];
  }
  return findings;
}

export function evaluatePassiveWorkflow(
  definition: WorkflowDefinition,
  captures: CapturedRequest[],
  targets: string[],
  inputs: Record<string, string> = {},
  createdAt = nowIso()
) {
  const scopedCaptures = definition.scope.requireInScope
    ? captures.filter((capture) => isAllowedTarget(capture.url, targets))
    : captures;
  const results: WorkflowResult[] = [];
  for (const step of definition.steps) {
    if (!shouldRunWorkflowStep(step, inputs) || isActiveWorkflowStep(step)) {
      continue;
    }
    const next =
      step.kind === "security-headers"
        ? securityHeaderResults(step, scopedCaptures, createdAt)
        : step.kind === "cookie-flags"
          ? cookieFlagResults(step, scopedCaptures, createdAt)
          : step.kind === "cors-policy"
            ? corsResults(step, scopedCaptures, createdAt)
            : step.kind === "cache-control"
              ? cacheResults(step, scopedCaptures, createdAt)
              : metadataResults(step, scopedCaptures, createdAt);
    results.push(...next);
    if (results.length >= definition.scope.maxResults) {
      return results.slice(0, definition.scope.maxResults);
    }
  }
  return results.slice(0, definition.scope.maxResults);
}

export function replayDraftFromCapture(capture: CapturedRequest, stripAuth: boolean): ReplayDraft {
  const headers = Object.fromEntries(
    Object.entries(capture.requestHeaders).filter(([key]) => {
      if (!stripAuth) {
        return true;
      }
      return !["authorization", "cookie"].includes(key.toLowerCase());
    })
  );
  return {
    method: capture.method,
    url: capture.url,
    headers,
    body: capture.requestBody
  };
}

export function activeReplayWorkflowResult(input: {
  step: WorkflowStep;
  capture: CapturedRequest;
  replay: ReplayResult;
  createdAt?: string;
}) {
  const createdAt = input.createdAt || nowIso();
  const originalStatus = input.capture.status || 0;
  const replayStatus = input.replay.status || 0;
  const replayBlocked = replayStatus === 401 || replayStatus === 403;
  const originalSuccess = originalStatus >= 200 && originalStatus < 400;
  const replaySuccess = replayStatus >= 200 && replayStatus < 400;
  if (replayBlocked) {
    return result({
      step: input.step,
      level: "pass",
      title: "Unauthenticated replay was blocked",
      message: `${input.capture.url} returned ${replayStatus} after credentials were stripped.`,
      evidence: [evidenceRefFromCapture(input.capture)],
      details: { originalStatus: String(originalStatus), replayStatus: String(replayStatus) },
      createdAt
    });
  }
  if (originalSuccess && replaySuccess) {
    return result({
      step: input.step,
      level: "fail",
      title: "Unauthenticated replay still succeeded",
      message: `${input.capture.url} returned ${replayStatus} after credentials were stripped; review authorization enforcement.`,
      evidence: [evidenceRefFromCapture(input.capture)],
      details: { originalStatus: String(originalStatus), replayStatus: String(replayStatus) },
      createdAt
    });
  }
  return result({
    step: input.step,
    level: "info",
    title: "Unauthenticated replay changed response",
    message: `${input.capture.url} changed from ${originalStatus || "unknown"} to ${replayStatus || "unknown"}.`,
    evidence: [evidenceRefFromCapture(input.capture)],
    details: { originalStatus: String(originalStatus), replayStatus: String(replayStatus) },
    createdAt
  });
}

export function activeBrowserWorkflowResult(input: { step: WorkflowStep; url: string; createdAt?: string }) {
  const createdAt = input.createdAt || nowIso();
  return result({
    step: input.step,
    level: "info",
    title: "Browser navigation opened",
    message: `Opened ${input.url} in the controlled Radar browser.`,
    details: { url: input.url },
    createdAt
  });
}

export function createWorkflowRunRecord(input: WorkflowRunInput): WorkflowRun {
  const startedAt = input.startedAt || nowIso();
  const completedAt = input.completedAt || (input.status === "completed" || input.status === "failed" ? nowIso() : undefined);
  return {
    id: createId("workflow_run"),
    workflowId: input.definition.id,
    workflowName: input.definition.name,
    sessionId: cleanLine(input.sessionId),
    source: input.source || "manual",
    mode: input.definition.mode,
    status: input.status || "queued",
    inputs: Object.fromEntries(
      Object.entries(input.inputs || {})
        .map(([key, value]) => [cleanId(key, ""), cleanLine(value)])
        .filter(([key]) => Boolean(key))
    ),
    startedAt,
    completedAt,
    stepCount: input.definition.steps.length,
    actionCount: input.actionCount || 0,
    results: (input.results || []).slice(0, input.definition.scope.maxResults),
    error: input.error ? cleanText(input.error) : undefined
  };
}

export function normalizeWorkflowRun(input: unknown): WorkflowRun | null {
  const value = objectValue(input);
  const results = (Array.isArray(value.results) ? value.results : [])
    .map((entry) => {
      const item = objectValue(entry);
      const stepId = cleanId(item.stepId, "");
      const title = cleanLine(item.title);
      if (!stepId || !title) {
        return null;
      }
      return {
        id: cleanId(item.id, createId("workflow_result")),
        stepId,
        stepTitle: cleanLine(item.stepTitle, stepId),
        level: normalizeEnum(item.level, ["pass", "info", "warn", "fail"] as const, "info"),
        title,
        message: cleanText(item.message),
        evidence: Array.isArray(item.evidence) ? (item.evidence as FindingEvidenceRef[]).slice(0, 12) : [],
        details: Object.fromEntries(
          Object.entries(objectValue(item.details))
            .map(([key, entry]) => [cleanLine(key), cleanLine(entry)])
            .filter(([key, entry]) => key && entry)
            .slice(0, 20)
        ),
        createdAt: cleanLine(item.createdAt, nowIso())
      } satisfies WorkflowResult;
    })
    .filter((entry): entry is WorkflowResult => Boolean(entry))
    .slice(0, MAX_WORKFLOW_RESULTS);
  const workflowId = cleanId(value.workflowId, "");
  const sessionId = cleanLine(value.sessionId);
  if (!workflowId || !sessionId) {
    return null;
  }
  return {
    id: cleanId(value.id, createId("workflow_run")),
    workflowId,
    workflowName: cleanLine(value.workflowName, workflowId),
    sessionId,
    source: value.source === "ai" ? "ai" : "manual",
    mode: normalizeEnum(value.mode, workflowModes, "passive"),
    status: normalizeEnum(value.status, ["queued", "running", "completed", "failed"] as const, "completed"),
    inputs: Object.fromEntries(
      Object.entries(objectValue(value.inputs))
        .map(([key, entry]) => [cleanId(key, ""), cleanLine(entry)])
        .filter(([key]) => Boolean(key))
    ),
    startedAt: cleanLine(value.startedAt, nowIso()),
    completedAt: typeof value.completedAt === "string" ? cleanLine(value.completedAt) : undefined,
    stepCount: clampNumber(value.stepCount, results.length, 0, MAX_WORKFLOW_STEPS),
    actionCount: clampNumber(value.actionCount, 0, 0, MAX_WORKFLOW_REQUESTS),
    results,
    error: typeof value.error === "string" ? cleanText(value.error) : undefined
  };
}

export function normalizeWorkflowRuns(input: unknown): WorkflowRun[] {
  const values = Array.isArray(input) ? input : [];
  return values.map(normalizeWorkflowRun).filter((entry): entry is WorkflowRun => Boolean(entry));
}

export function normalizeWorkflowRevision(input: unknown): WorkflowRevision | null {
  const value = objectValue(input);
  const workflow = normalizeWorkflowDefinition(value.workflow);
  const workflowId = cleanId(value.workflowId, workflow?.id || "");
  if (!workflow || !workflowId) {
    return null;
  }
  const diff = (Array.isArray(value.diff) ? value.diff : [])
    .map((entry): WorkflowDiffEntry | null => {
      const item = objectValue(entry);
      const kind = normalizeEnum(item.kind, ["added", "removed", "changed"] as const, "changed");
      const field = cleanLine(item.field);
      if (!field) {
        return null;
      }
      const diffEntry: WorkflowDiffEntry = {
        kind,
        field
      };
      if (typeof item.before === "string") {
        diffEntry.before = cleanLine(item.before);
      }
      if (typeof item.after === "string") {
        diffEntry.after = cleanLine(item.after);
      }
      return diffEntry;
    })
    .filter((entry): entry is WorkflowDiffEntry => Boolean(entry))
    .slice(0, 80);
  return {
    id: cleanId(value.id, createId("workflow_revision")),
    workflowId,
    workflowName: cleanLine(value.workflowName, workflow.name),
    savedAt: cleanLine(value.savedAt, nowIso()),
    summary: cleanLine(value.summary, diff.length > 0 ? `${diff.length} changes saved` : "Workflow version saved"),
    diff,
    workflow
  };
}

export function normalizeWorkflowRevisions(input: unknown): WorkflowRevision[] {
  return (Array.isArray(input) ? input : [])
    .map((entry) => normalizeWorkflowRevision(entry))
    .filter((entry): entry is WorkflowRevision => Boolean(entry))
    .slice(0, 80);
}

export function findingFromWorkflowResult(run: WorkflowRun, resultItem: WorkflowResult): Finding | null {
  if (resultItem.level !== "fail" && resultItem.level !== "warn") {
    return null;
  }
  const templateId: FindingTemplateId =
    /cors/i.test(resultItem.title) || resultItem.stepId.includes("cors")
      ? "cors"
      : /cache/i.test(resultItem.title) || resultItem.stepId.includes("cache")
        ? "cache"
        : /header/i.test(resultItem.title)
          ? "headers"
          : /auth|unauth/i.test(resultItem.title)
            ? "access-control"
            : "information-disclosure";
  const createdAt = nowIso();
  return normalizeFinding(
    {
      id: createId("finding"),
      title: resultItem.title,
      templateId,
      severity: resultItem.level === "fail" ? "medium" : "low",
      confidence: "medium",
      status: "draft",
      affectedAssets: Array.from(new Set(resultItem.evidence.map((ref) => ref.metadata.host || ref.label).filter(Boolean))).slice(0, 8),
      evidence: [workflowEvidenceRef(run, resultItem), ...resultItem.evidence],
      reproductionSteps: `Run workflow "${run.workflowName}" and review result "${resultItem.title}".`,
      impact: resultItem.message,
      remediation: "Review the workflow evidence and apply the relevant defensive control.",
      notes: Object.entries(resultItem.details)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n"),
      owner: "",
      retestResult: "",
      source: "workflow",
      sourceId: run.id,
      createdAt,
      updatedAt: createdAt
    },
    createdAt
  );
}
