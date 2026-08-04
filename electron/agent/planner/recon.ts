import type {
  AgentCapturedTrafficContext,
  AgentDecisionContext,
  AgentReconWorkerReport
} from "../../../shared/agent-types.js";
import { redactBody, redactHeaders } from "../../ai/context.js";
import { complete } from "../../ai/providers.js";
import { loadSettings } from "../../ai/settings.js";
import { createId, nowIso } from "../runtimeClock.js";

type ReconAssignment = {
  focus: string;
  label: string;
  brief: string;
};

const RECON_SYSTEM_PROMPT = `You are one read-only recon worker inside Radar's defensive security workbench.
Analyze only the supplied, already-scoped local evidence snapshot. Never choose a tool, navigate, replay traffic, mutate authentication, or request additional authority.
Separate direct observations from hypotheses. Do not claim a vulnerability from a missing header or isolated signal. Reference only evidence ids present in the snapshot.
Return JSON only: {"summary":"compact handoff","observations":["direct observation"],"evidenceRefs":["capture:id"],"gaps":["what the lead agent still needs to verify"]}.`;

function assignmentsFor(workerCount: number): ReconAssignment[] {
  if (workerCount === 1) {
    return [{
      focus: "scoped-overview",
      label: "Scoped overview",
      brief: "Map the visible surface, hardening signals, authentication clues, and API workflows. Prioritize the most useful next evidence gaps."
    }];
  }
  if (workerCount === 2) {
    return [
      {
        focus: "surface-api",
        label: "Surface + API",
        brief: "Map hosts, endpoints, content types, request methods, redirects, and likely API workflows."
      },
      {
        focus: "auth-hardening",
        label: "Auth + hardening",
        brief: "Review authentication/session clues, cookie attributes, response hardening headers, and CORS signals."
      }
    ];
  }
  if (workerCount === 3) {
    return [
      {
        focus: "surface-map",
        label: "Surface map",
        brief: "Map hosts, endpoints, redirects, methods, and visible navigation coverage."
      },
      {
        focus: "auth-hardening",
        label: "Auth + hardening",
        brief: "Review authentication/session clues, cookie attributes, response hardening headers, and CORS signals."
      },
      {
        focus: "api-workflows",
        label: "API + workflows",
        brief: "Review API shapes, structured payloads, workflow candidates, parameters, and coverage gaps."
      }
    ];
  }
  const assignments: ReconAssignment[] = [
    {
      focus: "surface-map",
      label: "Surface map",
      brief: "Map hosts, endpoints, redirects, methods, and visible navigation coverage."
    },
    {
      focus: "headers-cookies",
      label: "Headers + cookies",
      brief: "Review response hardening headers, cookie attributes, caching, and CORS signals."
    },
    {
      focus: "auth-session",
      label: "Auth + session",
      brief: "Review authentication boundaries, session state clues, identity coverage, and authorization gaps."
    },
    {
      focus: "api-workflows",
      label: "API + workflows",
      brief: "Review API shapes, structured payloads, workflow candidates, parameters, and coverage gaps."
    }
  ];
  return assignments;
}

function clip(value: unknown, max = 500) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactCapture(capture: AgentCapturedTrafficContext, includeRaw: boolean) {
  return {
    id: `capture:${capture.id}`,
    method: capture.method,
    url: capture.url,
    status: capture.status,
    statusText: capture.statusText,
    type: capture.type,
    mimeType: capture.mimeType,
    source: capture.source,
    requestHeaders: includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders),
    responseHeaders: includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders),
    requestBodyPreview: includeRaw
      ? clip(capture.requestBodyPreview)
      : clip(redactBody(capture.requestBodyPreview)),
    responseBodyPreview: includeRaw
      ? clip(capture.responseBodyPreview)
      : clip(redactBody(capture.responseBodyPreview))
  };
}

function workerPrompt(context: AgentDecisionContext, assignment: ReconAssignment) {
  return JSON.stringify({
    assignment: assignment.brief,
    goal: context.goal,
    startUrl: context.startUrl,
    targetOrigin: context.targetOrigin,
    allowlist: context.allowlist,
    browserState: context.browserState,
    profile: context.profile,
    contextSummary: context.contextSummary,
    capturedTraffic: context.capturedTraffic
      .slice(-18)
      .map((capture) => compactCapture(capture, context.policy.allowRawContext))
  }, null, 2);
}

function strings(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => clip(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function evidenceRefs(value: unknown, context: AgentDecisionContext) {
  const valid = new Set(context.capturedTraffic.map((capture) => `capture:${capture.id}`));
  return strings(value, 16, 180).filter((reference) => valid.has(reference));
}

function reportFromParsed({
  parsed,
  assignment,
  context,
  startedAt
}: {
  parsed: Record<string, unknown>;
  assignment: ReconAssignment;
  context: AgentDecisionContext;
  startedAt: string;
}): AgentReconWorkerReport {
  return {
    id: createId("recon"),
    focus: assignment.focus,
    label: assignment.label,
    status: "completed",
    summary: clip(parsed.summary || "Worker returned no summary.", 800),
    observations: strings(parsed.observations, 12, 500),
    evidenceRefs: evidenceRefs(parsed.evidenceRefs, context),
    gaps: strings(parsed.gaps, 10, 500),
    startedAt,
    completedAt: nowIso()
  };
}

function failedReport(assignment: ReconAssignment, startedAt: string, error: unknown): AgentReconWorkerReport {
  const message = clip(error instanceof Error ? error.message : "Recon worker failed.", 600);
  return {
    id: createId("recon"),
    focus: assignment.focus,
    label: assignment.label,
    status: "failed",
    summary: "This worker did not return a usable recon handoff.",
    observations: [],
    evidenceRefs: [],
    gaps: ["Lead agent should cover this assignment from the shared evidence context."],
    startedAt,
    completedAt: nowIso(),
    error: message
  };
}

export function createAiReconPlanner(userDataPath: string) {
  return async (context: AgentDecisionContext, requestedWorkers: number): Promise<AgentReconWorkerReport[]> => {
    const workerCount = Math.min(Math.max(Math.round(requestedWorkers || 1), 1), 4);
    const settings = loadSettings(userDataPath);
    const timeoutMs = Math.min(75_000, Math.max(20_000, Math.floor(context.policy.maxRuntimeMs / 5)));
    return Promise.all(assignmentsFor(workerCount).map(async (assignment) => {
      const startedAt = nowIso();
      try {
        const { parsed } = await complete({
          settings,
          system: RECON_SYSTEM_PROMPT,
          user: workerPrompt(context, assignment),
          timeoutMs
        });
        return reportFromParsed({ parsed, assignment, context, startedAt });
      } catch (error) {
        return failedReport(assignment, startedAt, error);
      }
    }));
  };
}
