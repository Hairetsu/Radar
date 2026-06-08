import type { AdvancedTestingSummary } from "./advancedTesting.js";
import { buildAdvancedTestingSummary } from "./advancedTesting.js";
import { isAllowedTarget } from "./allowlist.js";
import type { AgentContextSummary, AgentRunMemoryEntry } from "./agent-types.js";
import type {
  CapturedRequest,
  Finding,
  ProjectNote,
  SavedView,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "./domain.js";
import { buildSitemap } from "./sitemap.js";
import { summarizeAgentRunMemory } from "./agentMemory.js";

export type AgentContextSummaryInput = {
  captures: CapturedRequest[];
  frames: WebSocketEvent[];
  findings: Finding[];
  workflows: WorkflowDefinition[];
  workflowRuns: WorkflowRun[];
  projectNotes: ProjectNote[];
  savedViews: SavedView[];
  runMemory: AgentRunMemoryEntry[];
  allowlist: string[];
  advancedSummary?: AdvancedTestingSummary;
  captureLimit?: number;
  generatedAt?: string;
};

function capText(value: string, max = 160) {
  return String(value || "").slice(0, max);
}

export function buildAgentContextSummary(input: AgentContextSummaryInput): AgentContextSummary {
  const captureLimit = Math.max(1, Math.min(Math.round(input.captureLimit || 80), 100));
  const scopedCaptures = input.captures
    .filter((capture) => isAllowedTarget(capture.url, input.allowlist))
    .slice(0, captureLimit);
  const scopedFrames = input.frames.filter((frame) => isAllowedTarget(frame.url, input.allowlist)).slice(0, captureLimit);
  const sitemap = buildSitemap(scopedCaptures);
  const topHosts = sitemap.roots.slice(0, 8).map((hostId) => {
    const host = sitemap.nodes[hostId];
    return {
      host: host?.host || hostId,
      requestCount: host?.requestCount || 0,
      paths: (host?.childIds || []).slice(0, 8).map((pathId) => sitemap.nodes[pathId]?.path || pathId)
    };
  });
  const advanced = input.advancedSummary || buildAdvancedTestingSummary(scopedCaptures, scopedFrames);
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    sitemap: {
      hostCount: sitemap.roots.length,
      endpointCount: Object.values(sitemap.nodes).filter((node) => node.kind === "endpoint").length,
      topHosts
    },
    findings: input.findings.slice(0, 30).map((finding) => ({
      id: finding.id,
      title: capText(finding.title),
      severity: finding.severity,
      status: finding.status,
      confidence: finding.confidence,
      affectedAssets: finding.affectedAssets.slice(0, 8).map((asset) => capText(asset, 120)),
      evidenceRefs: finding.evidence.map((ref) => `${ref.kind}:${ref.id}`).slice(0, 12)
    })),
    advanced: {
      graphQlOperations: advanced.graphql.operations.length,
      imports: advanced.apiImport.drafts.length,
      authRows: advanced.authMatrix.length,
      parameters: advanced.parameters.length,
      secrets: advanced.secrets.length,
      headerSignals: advanced.headerSignals.length
    },
    workflows: {
      definitions: input.workflows.slice(0, 20).map((workflow) => ({
        id: workflow.id,
        name: capText(workflow.name),
        mode: workflow.mode,
        stepCount: workflow.steps.length,
        maxRequests: workflow.scope.maxRequests
      })),
      recentRuns: input.workflowRuns.slice(0, 12).map((run) => ({
        id: run.id,
        workflowId: run.workflowId,
        workflowName: capText(run.workflowName),
        status: run.status,
        mode: run.mode,
        actionCount: run.actionCount,
        startedAt: run.startedAt
      }))
    },
    projectArtifacts: {
      notes: input.projectNotes.slice(0, 12).map((note) => ({
        id: note.id,
        title: capText(note.title),
        updatedAt: note.updatedAt
      })),
      savedViews: input.savedViews.slice(0, 12).map((view) => ({
        id: view.id,
        name: capText(view.name),
        view: view.view,
        updatedAt: view.updatedAt
      }))
    },
    runMemory: summarizeAgentRunMemory(input.runMemory, 12)
  };
}

export function emptyAgentContextSummary(generatedAt = new Date().toISOString()): AgentContextSummary {
  return {
    generatedAt,
    sitemap: { hostCount: 0, endpointCount: 0, topHosts: [] },
    findings: [],
    advanced: { graphQlOperations: 0, imports: 0, authRows: 0, parameters: 0, secrets: 0, headerSignals: 0 },
    workflows: { definitions: [], recentRuns: [] },
    projectArtifacts: { notes: [], savedViews: [] },
    runMemory: []
  };
}
