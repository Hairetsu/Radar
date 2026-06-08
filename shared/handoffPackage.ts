import type {
  CapturedRequest,
  Finding,
  LocalProfile,
  LocalSession,
  LocalWorkspace,
  ProjectNote,
  ReplayCollection,
  WebSocketEvent,
  WorkflowDefinition
} from "./domain.js";
import { normalizeFindings } from "./findings.js";
import { normalizeProjectNotes } from "./projectArtifacts.js";
import { normalizeReplayCollections } from "./replayCollections.js";
import { normalizeWorkflowDefinitions } from "./workflows.js";
import { buildProjectBundle, type ProjectBundleRedactionProfile } from "./projectBundle.js";

export const HANDOFF_PACKAGE_FORMAT = "radar.handoff-package";
export const HANDOFF_PACKAGE_SCHEMA_VERSION = 1;

export type HandoffPackageOptions = {
  title?: string;
  redaction: ProjectBundleRedactionProfile;
  includeDraftFindings?: boolean;
  includeProjectNotes?: boolean;
  includeReplayCollections?: boolean;
  includeWorkflows?: boolean;
};

export type HandoffPackageInput = {
  profile: LocalProfile;
  workspace: LocalWorkspace;
  session: LocalSession;
  targets: string[];
  captures: CapturedRequest[];
  webSocketEvents: WebSocketEvent[];
  findings: Finding[];
  workflows: WorkflowDefinition[];
  replayCollections: ReplayCollection[];
  projectNotes: ProjectNote[];
};

export type HandoffPackageStats = {
  findings: number;
  captures: number;
  webSocketEvents: number;
  workflows: number;
  replayCollections: number;
  projectNotes: number;
  targets: number;
};

export type HandoffPackage = {
  format: typeof HANDOFF_PACKAGE_FORMAT;
  schemaVersion: typeof HANDOFF_PACKAGE_SCHEMA_VERSION;
  exportedAt: string;
  title: string;
  redaction: ProjectBundleRedactionProfile;
  project: { id: string; name: string };
  session: { id: string; name: string };
  targets: string[];
  findings: Finding[];
  captures: CapturedRequest[];
  webSocketEvents: WebSocketEvent[];
  workflows: WorkflowDefinition[];
  replayCollections: ReplayCollection[];
  projectNotes: ProjectNote[];
  summaryMarkdown: string;
  warnings: string[];
  stats: HandoffPackageStats;
};

export type HandoffPackagePreview = {
  ok: boolean;
  package: HandoffPackage | null;
  stats: HandoffPackageStats;
  warnings: string[];
  error?: string;
};

function emptyStats(): HandoffPackageStats {
  return {
    findings: 0,
    captures: 0,
    webSocketEvents: 0,
    workflows: 0,
    replayCollections: 0,
    projectNotes: 0,
    targets: 0
  };
}

function reviewedFindings(findings: Finding[], includeDraftFindings: boolean) {
  const normalized = normalizeFindings(findings);
  return includeDraftFindings ? normalized : normalized.filter((finding) => finding.status !== "draft");
}

function evidenceIdsForFindings(findings: Finding[]) {
  const captures = new Set<string>();
  const frames = new Set<string>();
  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (evidence.kind === "capture") {
        captures.add(evidence.id);
      }
      if (evidence.kind === "websocket") {
        frames.add(evidence.id);
      }
    }
  }
  return { captures, frames };
}

function markdownLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildSummary(input: {
  title: string;
  targets: string[];
  findings: Finding[];
  warnings: string[];
  stats: HandoffPackageStats;
}) {
  const lines = [
    `# ${markdownLine(input.title) || "Radar Handoff Package"}`,
    "",
    `Generated findings: ${input.stats.findings}`,
    `Evidence: ${input.stats.captures} HTTP/S captures, ${input.stats.webSocketEvents} WebSocket frames`,
    `Scope targets proposed: ${input.targets.length}`,
    ""
  ];
  if (input.targets.length > 0) {
    lines.push("## Scope", "", ...input.targets.map((target) => `- ${target}`), "");
  }
  if (input.findings.length > 0) {
    lines.push("## Findings", "");
    for (const finding of input.findings) {
      lines.push(`- [${finding.severity}/${finding.status}] ${finding.title}`);
    }
    lines.push("");
  }
  if (input.warnings.length > 0) {
    lines.push("## Warnings", "", ...input.warnings.map((warning) => `- ${warning}`), "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function packageStats(pkg: Pick<HandoffPackage, "findings" | "captures" | "webSocketEvents" | "workflows" | "replayCollections" | "projectNotes" | "targets">): HandoffPackageStats {
  return {
    findings: pkg.findings.length,
    captures: pkg.captures.length,
    webSocketEvents: pkg.webSocketEvents.length,
    workflows: pkg.workflows.length,
    replayCollections: pkg.replayCollections.length,
    projectNotes: pkg.projectNotes.length,
    targets: pkg.targets.length
  };
}

export function buildHandoffPackage(input: HandoffPackageInput, options: HandoffPackageOptions): HandoffPackagePreview {
  const title = markdownLine(options.title || `${input.profile.name} Handoff`);
  const findings = reviewedFindings(input.findings, options.includeDraftFindings === true);
  const evidenceIds = evidenceIdsForFindings(findings);
  const captures = input.captures.filter((capture) => evidenceIds.captures.has(capture.id));
  const webSocketEvents = input.webSocketEvents.filter((event) => evidenceIds.frames.has(event.id));
  const workflows = options.includeWorkflows === false ? [] : normalizeWorkflowDefinitions(input.workflows).filter((workflow) => !workflow.builtIn);
  const replayCollections =
    options.includeReplayCollections === false ? [] : normalizeReplayCollections(input.replayCollections);
  const projectNotes = options.includeProjectNotes === false ? [] : normalizeProjectNotes(input.projectNotes);
  const bundlePreview = buildProjectBundle(
    {
      profile: input.profile,
      workspace: input.workspace,
      targets: input.targets,
      savedFilters: [],
      projectNotes,
      savedViews: [],
      workflows,
      replayCollections,
      plugins: [],
      sessions: [
        {
          session: input.session,
          captures,
          webSocketEvents,
          evidenceAnnotations: [],
          findings,
          workflowRuns: []
        }
      ]
    },
    {
      redaction: options.redaction,
      includeReplayCollections: options.includeReplayCollections,
      includePlugins: false
    }
  );
  if (!bundlePreview.ok || !bundlePreview.bundle) {
    return { ok: false, package: null, stats: emptyStats(), warnings: [], error: bundlePreview.error };
  }
  const session = bundlePreview.bundle.sessions[0];
  const warnings = [
    ...bundlePreview.warnings,
    findings.length === 0 ? "No reviewed findings matched this handoff package." : ""
  ].filter(Boolean);
  const pkg: HandoffPackage = {
    format: HANDOFF_PACKAGE_FORMAT,
    schemaVersion: HANDOFF_PACKAGE_SCHEMA_VERSION,
    exportedAt: bundlePreview.bundle.exportedAt,
    title,
    redaction: options.redaction,
    project: { id: input.profile.id, name: input.profile.name },
    session: { id: input.session.id, name: input.session.name },
    targets: bundlePreview.bundle.targets,
    findings: session?.findings || [],
    captures: session?.captures || [],
    webSocketEvents: session?.webSocketEvents || [],
    workflows: bundlePreview.bundle.workflows,
    replayCollections: bundlePreview.bundle.replayCollections,
    projectNotes: bundlePreview.bundle.projectNotes,
    summaryMarkdown: "",
    warnings,
    stats: emptyStats()
  };
  const stats = packageStats(pkg);
  const summaryMarkdown = buildSummary({ title, targets: pkg.targets, findings: pkg.findings, warnings, stats });
  return { ok: true, package: { ...pkg, stats, summaryMarkdown }, stats, warnings };
}

export function serializeHandoffPackage(pkg: HandoffPackage) {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
