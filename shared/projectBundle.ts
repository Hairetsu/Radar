import type {
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  InstalledPlugin,
  LocalProfile,
  LocalSession,
  LocalWorkspace,
  ProjectNote,
  ReplayCollection,
  SavedFilter,
  SavedView,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "./domain.js";
import { normalizeFindings } from "./findings.js";
import { normalizeInstalledPlugins } from "./plugins.js";
import { normalizeProjectNotes, normalizeSavedViews } from "./projectArtifacts.js";
import { normalizeReplayCollections } from "./replayCollections.js";
import { normalizeSavedFilters } from "./savedFilters.js";
import { normalizeWorkflowDefinitions, normalizeWorkflowRuns } from "./workflows.js";

export const PROJECT_BUNDLE_SCHEMA_VERSION = 1;
export const PROJECT_BUNDLE_FORMAT = "radar.project-bundle";
export const MAX_BUNDLE_BYTES = 12 * 1024 * 1024;

export type ProjectBundleRedactionProfile =
  | "metadata-only"
  | "redacted-evidence"
  | "reviewed-findings"
  | "raw-evidence";

export type ProjectBundleOptions = {
  redaction: ProjectBundleRedactionProfile;
  includePlugins?: boolean;
  includeReplayCollections?: boolean;
};

export type ProjectBundleSession = {
  session: LocalSession;
  captures: CapturedRequest[];
  webSocketEvents: WebSocketEvent[];
  evidenceAnnotations: EvidenceAnnotation[];
  findings: Finding[];
  workflowRuns: WorkflowRun[];
};

export type ProjectBundle = {
  format: typeof PROJECT_BUNDLE_FORMAT;
  schemaVersion: typeof PROJECT_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  redaction: ProjectBundleRedactionProfile;
  project: Pick<LocalProfile, "id" | "name" | "createdAt" | "updatedAt">;
  workspace: Pick<LocalWorkspace, "id" | "name" | "createdAt" | "updatedAt">;
  targets: string[];
  savedFilters: SavedFilter[];
  projectNotes: ProjectNote[];
  savedViews: SavedView[];
  workflows: WorkflowDefinition[];
  replayCollections: ReplayCollection[];
  plugins: InstalledPlugin[];
  sessions: ProjectBundleSession[];
  warnings: string[];
  stats: ProjectBundleStats;
};

export type ProjectBundleInput = {
  profile: LocalProfile;
  workspace: LocalWorkspace;
  targets: string[];
  savedFilters: SavedFilter[];
  projectNotes: ProjectNote[];
  savedViews: SavedView[];
  workflows: WorkflowDefinition[];
  replayCollections: ReplayCollection[];
  plugins: InstalledPlugin[];
  sessions: ProjectBundleSession[];
};

export type ProjectBundleStats = {
  sessions: number;
  captures: number;
  webSocketEvents: number;
  findings: number;
  workflows: number;
  projectNotes: number;
  savedViews: number;
  replayCollections: number;
  plugins: number;
  proposedTargets: number;
};

export type ProjectBundleExportPreview = {
  ok: boolean;
  bundle: ProjectBundle | null;
  stats: ProjectBundleStats;
  warnings: string[];
  error?: string;
};

export type ProjectBundleImportConflict = {
  kind: "capture" | "websocket" | "finding" | "workflow" | "note" | "saved-view";
  id: string;
  action: "replace" | "skip";
};

export type ProjectBundleImportPreview = {
  ok: boolean;
  bundle: ProjectBundle | null;
  stats: ProjectBundleStats;
  warnings: string[];
  conflicts: ProjectBundleImportConflict[];
  proposedTargets: string[];
  inactiveTargets: string[];
  error?: string;
};

export type ProjectBundleApplyResult = {
  ok: boolean;
  imported: ProjectBundleStats;
  skipped: ProjectBundleStats;
  proposedTargets: string[];
  message: string;
};

const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization"
]);

function emptyStats(): ProjectBundleStats {
  return {
    sessions: 0,
    captures: 0,
    webSocketEvents: 0,
    findings: 0,
    workflows: 0,
    projectNotes: 0,
    savedViews: 0,
    replayCollections: 0,
    plugins: 0,
    proposedTargets: 0
  };
}

function cleanLine(value: unknown, fallback = "") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 180);
}

function normalizeTargets(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(new Set(input.map((target) => cleanLine(target)).filter(Boolean))).slice(0, 200);
}

function redactHeaders(headers: Record<string, string>, allowRaw: boolean) {
  if (allowRaw) {
    return { ...headers };
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitiveHeaderNames.has(key.toLowerCase()) ? "[redacted]" : String(value || "").slice(0, 500)
    ])
  );
}

function redactBody(value: string, allowRaw: boolean, metadataOnly: boolean) {
  if (allowRaw) {
    return value;
  }
  if (metadataOnly || !value) {
    return "";
  }
  return `[redacted body ${value.length} chars]`;
}

function redactCapture(capture: CapturedRequest, profile: ProjectBundleRedactionProfile): CapturedRequest {
  const allowRaw = profile === "raw-evidence";
  const metadataOnly = profile === "metadata-only";
  return {
    ...capture,
    requestHeaders: metadataOnly ? {} : redactHeaders(capture.requestHeaders, allowRaw),
    responseHeaders: metadataOnly ? {} : redactHeaders(capture.responseHeaders, allowRaw),
    requestBody: redactBody(capture.requestBody, allowRaw, metadataOnly),
    responseBody: redactBody(capture.responseBody, allowRaw, metadataOnly),
    tls: allowRaw ? capture.tls : capture.tls ? { ...capture.tls, issuer: capture.tls.issuer || "" } : capture.tls,
    intercept: allowRaw ? capture.intercept : undefined,
    rewrites: allowRaw ? capture.rewrites : undefined
  };
}

function redactWebSocketEvent(event: WebSocketEvent, profile: ProjectBundleRedactionProfile): WebSocketEvent {
  const allowRaw = profile === "raw-evidence";
  const metadataOnly = profile === "metadata-only";
  return {
    ...event,
    requestHeaders: metadataOnly ? {} : redactHeaders(event.requestHeaders || {}, allowRaw),
    responseHeaders: metadataOnly ? {} : redactHeaders(event.responseHeaders || {}, allowRaw),
    payloadData: allowRaw ? event.payloadData : metadataOnly || !event.payloadData ? "" : `[redacted payload ${event.size} bytes]`
  };
}

function findingEvidenceIds(findings: Finding[]) {
  const captures = new Set<string>();
  const frames = new Set<string>();
  for (const finding of findings) {
    for (const ref of finding.evidence) {
      if (ref.kind === "capture") {
        captures.add(ref.id);
      }
      if (ref.kind === "websocket") {
        frames.add(ref.id);
      }
    }
  }
  return { captures, frames };
}

function reviewedFindings(findings: Finding[]) {
  return findings.filter((finding) => finding.status !== "draft");
}

function pluginMetadata(plugins: InstalledPlugin[], includePlugins: boolean) {
  if (!includePlugins) {
    return [];
  }
  return plugins.map((plugin) => {
    const status: InstalledPlugin["status"] = plugin.status === "blocked" ? "blocked" : "pending";
    return {
      ...plugin,
      sourcePath: "",
      grantedPermissions: [],
      status,
      warnings: [...plugin.warnings, "Imported as metadata only; approve from local disk before use."]
    };
  });
}

export function projectBundleStats(bundle: Pick<ProjectBundle, "sessions" | "workflows" | "projectNotes" | "savedViews" | "replayCollections" | "plugins" | "targets">): ProjectBundleStats {
  return {
    sessions: bundle.sessions.length,
    captures: bundle.sessions.reduce((count, session) => count + session.captures.length, 0),
    webSocketEvents: bundle.sessions.reduce((count, session) => count + session.webSocketEvents.length, 0),
    findings: bundle.sessions.reduce((count, session) => count + session.findings.length, 0),
    workflows: bundle.workflows.length,
    projectNotes: bundle.projectNotes.length,
    savedViews: bundle.savedViews.length,
    replayCollections: bundle.replayCollections.length,
    plugins: bundle.plugins.length,
    proposedTargets: bundle.targets.length
  };
}

export function buildProjectBundle(input: ProjectBundleInput, options: ProjectBundleOptions): ProjectBundleExportPreview {
  const redaction = options.redaction || "redacted-evidence";
  const warnings: string[] = [];
  if (redaction === "raw-evidence") {
    warnings.push("Raw evidence export includes request/response headers, bodies, WebSocket payloads, cookies, and authorization values.");
  }
  if (redaction !== "raw-evidence") {
    warnings.push("Evidence payloads are redacted. Use raw evidence only after explicit operator approval.");
  }
  if (!options.includePlugins && input.plugins.length > 0) {
    warnings.push("Plugin records are excluded from this bundle.");
  }

  const sessions = input.sessions.map((sessionItem) => {
    const findings = redaction === "reviewed-findings" ? reviewedFindings(sessionItem.findings) : sessionItem.findings;
    const evidenceIds = findingEvidenceIds(findings);
    const captures =
      redaction === "reviewed-findings"
        ? sessionItem.captures.filter((capture) => evidenceIds.captures.has(capture.id))
        : sessionItem.captures;
    const webSocketEvents =
      redaction === "reviewed-findings"
        ? sessionItem.webSocketEvents.filter((event) => evidenceIds.frames.has(event.id))
        : sessionItem.webSocketEvents;
    return {
      session: sessionItem.session,
      captures: captures.map((capture) => redactCapture(capture, redaction)),
      webSocketEvents: webSocketEvents.map((event) => redactWebSocketEvent(event, redaction)),
      evidenceAnnotations: redaction === "metadata-only" ? [] : sessionItem.evidenceAnnotations,
      findings: normalizeFindings(findings),
      workflowRuns: redaction === "metadata-only" ? [] : normalizeWorkflowRuns(sessionItem.workflowRuns)
    };
  });

  const bundle: ProjectBundle = {
    format: PROJECT_BUNDLE_FORMAT,
    schemaVersion: PROJECT_BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    redaction,
    project: {
      id: input.profile.id,
      name: input.profile.name,
      createdAt: input.profile.createdAt,
      updatedAt: input.profile.updatedAt
    },
    workspace: {
      id: input.workspace.id,
      name: input.workspace.name,
      createdAt: input.workspace.createdAt,
      updatedAt: input.workspace.updatedAt
    },
    targets: normalizeTargets(input.targets),
    savedFilters: normalizeSavedFilters(input.savedFilters),
    projectNotes: normalizeProjectNotes(input.projectNotes),
    savedViews: normalizeSavedViews(input.savedViews),
    workflows: normalizeWorkflowDefinitions(input.workflows).filter((workflow) => !workflow.builtIn),
    replayCollections: options.includeReplayCollections === false ? [] : normalizeReplayCollections(input.replayCollections),
    plugins: pluginMetadata(normalizeInstalledPlugins(input.plugins), options.includePlugins === true),
    sessions,
    warnings,
    stats: emptyStats()
  };
  const stats = projectBundleStats(bundle);
  return { ok: true, bundle: { ...bundle, stats }, stats, warnings };
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
}

function normalizeSession(input: unknown): LocalSession | null {
  const value = asRecord(input);
  if (!value) {
    return null;
  }
  const id = cleanLine(value.id);
  const name = cleanLine(value.name, "Imported Session");
  if (!id || !name) {
    return null;
  }
  return {
    id,
    workspaceId: cleanLine(value.workspaceId),
    name,
    startedAt: cleanLine(value.startedAt, new Date().toISOString()),
    updatedAt: cleanLine(value.updatedAt, new Date().toISOString())
  };
}

function normalizeBundleSession(input: unknown): ProjectBundleSession | null {
  const value = asRecord(input);
  const session = normalizeSession(value?.session);
  if (!value || !session) {
    return null;
  }
  return {
    session,
    captures: Array.isArray(value.captures) ? (value.captures as CapturedRequest[]) : [],
    webSocketEvents: Array.isArray(value.webSocketEvents) ? (value.webSocketEvents as WebSocketEvent[]) : [],
    evidenceAnnotations: Array.isArray(value.evidenceAnnotations) ? (value.evidenceAnnotations as EvidenceAnnotation[]) : [],
    findings: normalizeFindings(value.findings),
    workflowRuns: normalizeWorkflowRuns(value.workflowRuns)
  };
}

export function normalizeProjectBundle(input: unknown): ProjectBundle | null {
  const value = asRecord(input);
  if (!value || value.format !== PROJECT_BUNDLE_FORMAT || value.schemaVersion !== PROJECT_BUNDLE_SCHEMA_VERSION) {
    return null;
  }
  const project = asRecord(value.project);
  const workspace = asRecord(value.workspace);
  if (!project || !workspace) {
    return null;
  }
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map(normalizeBundleSession).filter((session): session is ProjectBundleSession => Boolean(session))
    : [];
  const bundle: ProjectBundle = {
    format: PROJECT_BUNDLE_FORMAT,
    schemaVersion: PROJECT_BUNDLE_SCHEMA_VERSION,
    exportedAt: cleanLine(value.exportedAt, new Date().toISOString()),
    redaction:
      value.redaction === "metadata-only" ||
      value.redaction === "reviewed-findings" ||
      value.redaction === "raw-evidence"
        ? value.redaction
        : "redacted-evidence",
    project: {
      id: cleanLine(project.id),
      name: cleanLine(project.name, "Imported Project"),
      createdAt: cleanLine(project.createdAt, new Date().toISOString()),
      updatedAt: cleanLine(project.updatedAt, new Date().toISOString())
    },
    workspace: {
      id: cleanLine(workspace.id),
      name: cleanLine(workspace.name, "Imported Workspace"),
      createdAt: cleanLine(workspace.createdAt, new Date().toISOString()),
      updatedAt: cleanLine(workspace.updatedAt, new Date().toISOString())
    },
    targets: normalizeTargets(value.targets),
    savedFilters: normalizeSavedFilters(value.savedFilters),
    projectNotes: normalizeProjectNotes(value.projectNotes),
    savedViews: normalizeSavedViews(value.savedViews),
    workflows: normalizeWorkflowDefinitions(value.workflows).filter((workflow) => !workflow.builtIn),
    replayCollections: normalizeReplayCollections(value.replayCollections),
    plugins: normalizeInstalledPlugins(value.plugins),
    sessions,
    warnings: Array.isArray(value.warnings) ? value.warnings.map((warning) => cleanLine(warning)).filter(Boolean) : [],
    stats: emptyStats()
  };
  return { ...bundle, stats: projectBundleStats(bundle) };
}

export function parseProjectBundleJson(text: string): { ok: true; bundle: ProjectBundle } | { ok: false; error: string } {
  if (text.length > MAX_BUNDLE_BYTES) {
    return { ok: false, error: "Project bundle is too large." };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const bundle = normalizeProjectBundle(parsed);
    if (!bundle) {
      return { ok: false, error: "Project bundle format or schema version was not recognized." };
    }
    return { ok: true, bundle };
  } catch {
    return { ok: false, error: "Project bundle JSON could not be parsed." };
  }
}

function idSet<T extends { id: string }>(items: T[]) {
  return new Set(items.map((item) => item.id));
}

export function previewProjectBundleImport(input: {
  bundle: ProjectBundle;
  activeTargets: string[];
  existingCaptures?: CapturedRequest[];
  existingWebSocketEvents?: WebSocketEvent[];
  existingFindings?: Finding[];
  existingWorkflows?: WorkflowDefinition[];
  existingProjectNotes?: ProjectNote[];
  existingSavedViews?: SavedView[];
}): ProjectBundleImportPreview {
  const bundle = normalizeProjectBundle(input.bundle);
  if (!bundle) {
    return {
      ok: false,
      bundle: null,
      stats: emptyStats(),
      warnings: [],
      conflicts: [],
      proposedTargets: [],
      inactiveTargets: [],
      error: "Project bundle format or schema version was not recognized."
    };
  }
  const activeTargets = normalizeTargets(input.activeTargets);
  const proposedTargets = bundle.targets.filter((target) => !activeTargets.includes(target));
  const conflicts: ProjectBundleImportConflict[] = [];
  const captureIds = idSet(input.existingCaptures || []);
  const frameIds = idSet(input.existingWebSocketEvents || []);
  const findingIds = idSet(input.existingFindings || []);
  const workflowIds = idSet(input.existingWorkflows || []);
  const noteIds = idSet(input.existingProjectNotes || []);
  const viewIds = idSet(input.existingSavedViews || []);

  for (const sessionItem of bundle.sessions) {
    for (const capture of sessionItem.captures) {
      if (captureIds.has(capture.id)) {
        conflicts.push({ kind: "capture", id: capture.id, action: "skip" });
      }
    }
    for (const event of sessionItem.webSocketEvents) {
      if (frameIds.has(event.id)) {
        conflicts.push({ kind: "websocket", id: event.id, action: "skip" });
      }
    }
    for (const finding of sessionItem.findings) {
      if (findingIds.has(finding.id)) {
        conflicts.push({ kind: "finding", id: finding.id, action: "skip" });
      }
    }
  }
  for (const workflow of bundle.workflows) {
    if (workflowIds.has(workflow.id)) {
      conflicts.push({ kind: "workflow", id: workflow.id, action: "skip" });
    }
  }
  for (const note of bundle.projectNotes) {
    if (noteIds.has(note.id)) {
      conflicts.push({ kind: "note", id: note.id, action: "skip" });
    }
  }
  for (const view of bundle.savedViews) {
    if (viewIds.has(view.id)) {
      conflicts.push({ kind: "saved-view", id: view.id, action: "skip" });
    }
  }

  return {
    ok: true,
    bundle,
    stats: projectBundleStats(bundle),
    warnings: [
      ...bundle.warnings,
      proposedTargets.length > 0 ? "Imported scope targets are previewed but will not be applied automatically." : ""
    ].filter(Boolean),
    conflicts,
    proposedTargets,
    inactiveTargets: proposedTargets
  };
}

export function serializeProjectBundle(bundle: ProjectBundle) {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
