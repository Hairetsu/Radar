import type {
  AgentCapturedTrafficContext,
  AgentDecisionContext
} from "../../../shared/agent-types.js";
import { redactBody, redactHeaders } from "../../ai/context.js";
import { toolSchemas } from "../tools.js";

function clip(value: unknown, max = 700) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactCapturedTraffic(capture: AgentCapturedTrafficContext, includeRaw: boolean) {
  return {
    ...capture,
    requestHeaders: includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders),
    responseHeaders: includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders),
    requestBodyPreview: includeRaw ? clip(capture.requestBodyPreview) : clip(redactBody(capture.requestBodyPreview)),
    responseBodyPreview: includeRaw ? clip(capture.responseBodyPreview) : clip(redactBody(capture.responseBodyPreview))
  };
}

function compactInterceptItem<T extends { headers: Record<string, string>; body: string }>(item: T, includeRaw: boolean) {
  return {
    ...item,
    headers: includeRaw ? item.headers : redactHeaders(item.headers),
    body: includeRaw ? clip(item.body) : clip(redactBody(item.body))
  };
}

function compactToolResult(result: AgentDecisionContext["timeline"][number]["toolResult"], includeRaw: boolean) {
  if (!result) {
    return undefined;
  }

  if (!result.ok) {
    return result;
  }

  if (result.tool === "getCaptures") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        captures: result.data.captures.slice(-24).map((capture) => ({
          id: capture.id,
          method: capture.method,
          url: capture.url,
          status: capture.status,
          statusText: capture.statusText,
          type: capture.type,
          mimeType: capture.mimeType,
          requestHeaders: includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders),
          responseHeaders: includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders),
          requestBodyPreview: includeRaw ? clip(capture.requestBody) : clip(redactBody(capture.requestBody)),
          responseBodyPreview: includeRaw ? clip(capture.responseBody) : clip(redactBody(capture.responseBody))
        }))
      }
    };
  }

  if (result.tool === "sendReplay") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        ok: result.data.ok,
        status: result.data.status,
        statusText: result.data.statusText,
        headers: result.data.headers,
        bodyPreview: clip(result.data.body),
        durationMs: result.data.durationMs
      }
    };
  }

  if (result.tool === "getInterceptQueue") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        queue: result.data.queue.map((item) => compactInterceptItem(item, includeRaw))
      }
    };
  }

  if (result.tool === "prepareAutomateDraft") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        ...result.data,
        draft: {
          ...result.data.draft,
          headers: includeRaw ? result.data.draft.headers : redactHeaders(result.data.draft.headers),
          body: includeRaw ? clip(result.data.draft.body) : clip(redactBody(result.data.draft.body))
        },
        payloads: includeRaw ? result.data.payloads.slice(0, 25) : result.data.payloads.slice(0, 25).map(() => "[redacted]"),
        rules: result.data.rules,
        note: result.data.note
      }
    };
  }

  if (result.tool === "getWorkflowCatalog") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        workflows: result.data.workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          mode: workflow.mode,
          inputIds: workflow.inputs.map((input) => input.id),
          steps: workflow.steps.map((step) => ({ id: step.id, kind: step.kind }))
        })),
        recentRuns: result.data.recentRuns
      }
    };
  }

  if (result.tool === "runWorkflow") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        id: result.data.id,
        workflowId: result.data.workflowId,
        status: result.data.status,
        mode: result.data.mode,
        actionCount: result.data.actionCount,
        results: result.data.results.map((item) => ({
          id: item.id,
          level: item.level,
          title: item.title,
          evidenceRefs: item.evidence.map((ref) => `${ref.kind}:${ref.id}`)
        }))
      }
    };
  }

  if (result.tool === "prepareInterceptEdit") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        item: compactInterceptItem(result.data.item, includeRaw),
        draft: result.data.draft
          ? {
              ...result.data.draft,
              headers: includeRaw ? result.data.draft.headers : redactHeaders(result.data.draft.headers),
              body: includeRaw ? clip(result.data.draft.body) : clip(redactBody(result.data.draft.body))
            }
          : undefined,
        response: result.data.response
          ? {
              ...result.data.response,
              headers: includeRaw ? result.data.response.headers : redactHeaders(result.data.response.headers),
              body: includeRaw ? clip(result.data.response.body) : clip(redactBody(result.data.response.body))
            }
          : undefined,
        note: result.data.note
      }
    };
  }

  if (result.tool === "getPageText") {
    return { ...result, data: { ...result.data, text: clip(result.data.text, 1600) } };
  }

  if (result.tool === "getDomSummary") {
    return {
      ...result,
      data: {
        ...result.data,
        text: clip(result.data.text, 1600),
        ariaSnapshot: clip(result.data.ariaSnapshot, 3000),
        links: result.data.links.slice(0, 30),
        buttons: result.data.buttons.slice(0, 30),
        forms: result.data.forms.slice(0, 10)
      }
    };
  }

  if (result.tool === "getClickableElements") {
    return { ...result, data: { ...result.data, elements: result.data.elements.slice(0, 50) } };
  }

  if (result.tool === "getCookies") {
    return {
      ...result,
      data: { cookies: result.data.cookies.map((cookie) => ({ ...cookie, value: cookie.value ? "[redacted]" : "" })) }
    };
  }

  if (result.tool === "getStorageState") {
    return {
      ...result,
      data: {
        ...result.data,
        cookies: result.data.cookies.map((cookie) => ({ ...cookie, value: cookie.value ? "[redacted]" : "" })),
        localStorage: Object.fromEntries(Object.keys(result.data.localStorage).map((key) => [key, "[redacted]"])),
        sessionStorage: Object.fromEntries(Object.keys(result.data.sessionStorage).map((key) => [key, "[redacted]"]))
      }
    };
  }

  return result;
}

function compactCapabilities(state: AgentDecisionContext["capabilities"]) {
  return {
    revision: state.revision,
    leases: state.leases.map((lease) => ({
      id: lease.id,
      name: lease.name,
      status: lease.status,
      riskTier: lease.riskTier,
      tools: lease.tools,
      grants: lease.grants,
      expiresAt: lease.expiresAt,
      remainingUses: Math.max(0, lease.maxUses - lease.usedUses),
      remainingRequests: Math.max(0, lease.maxRequests - lease.usedRequests),
      reason: lease.reason,
      revocationReason: lease.revocationReason
    })),
    recentReceipts: state.receipts.slice(-16)
  };
}

function compactMission(mission: AgentDecisionContext["mission"]) {
  const objectives = [...mission.objectives]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, 16);
  const hypotheses = [...mission.hypotheses]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) || left.priority - right.priority || left.id.localeCompare(right.id)
    )
    .slice(0, 32);
  const experiments = [...mission.experiments]
    .sort((left, right) => left.status.localeCompare(right.status) || left.id.localeCompare(right.id))
    .slice(0, 40);
  const claims = [...mission.claims]
    .sort((left, right) => left.status.localeCompare(right.status) || left.id.localeCompare(right.id))
    .slice(0, 32);
  const coverage = [...mission.coverage]
    .sort(
      (left, right) =>
        left.status.localeCompare(right.status) ||
        left.dimension.localeCompare(right.dimension) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, 64);
  return {
    version: mission.version,
    revision: mission.revision,
    status: mission.status,
    stopReason: mission.stopReason,
    counts: {
      objectives: mission.objectives.length,
      hypotheses: mission.hypotheses.length,
      experiments: mission.experiments.length,
      claims: mission.claims.length,
      coverage: mission.coverage.length
    },
    objectives,
    hypotheses,
    experiments,
    claims,
    coverage,
    operatorQuestions: mission.operatorQuestions
  };
}

export function buildAgentUserPrompt(context: AgentDecisionContext) {
  const includeRaw = context.policy.allowRawContext;
  return JSON.stringify(
    {
      goal: context.goal,
      startUrl: context.startUrl,
      targetOrigin: context.targetOrigin,
      allowlist: context.allowlist,
      browserState: context.browserState,
      profile: context.profile,
      tutorialMode: context.tutorialMode,
      policy: context.policy,
      budgetRemaining: {
        toolCalls: Math.max(context.policy.maxSteps - context.stepCount, 0),
        replay: Math.max(context.policy.maxReplay - context.replayCount, 0),
        workflowRequests: Math.max(context.policy.maxWorkflowRequests - context.workflowRequestCount, 0)
      },
      availableTools: context.availableTools,
      toolSchema: toolSchemas(),
      capturedTraffic: context.capturedTraffic.map((capture) => compactCapturedTraffic(capture, includeRaw)),
      contextSummary: context.contextSummary,
      runMemory: context.runMemory,
      mission: compactMission(context.mission),
      capabilities: compactCapabilities(context.capabilities),
      reconReports: (context.reconReports || []).map((report) => ({
        id: report.id,
        focus: report.focus,
        label: report.label,
        status: report.status,
        summary: report.summary,
        observations: report.observations,
        evidenceRefs: report.evidenceRefs,
        gaps: report.gaps,
        error: report.error
      })),
      timeline: context.timeline.map((entry) => ({
        id: entry.id,
        note: entry.note,
        phase: entry.phase,
        summary: entry.summary,
        target: entry.target,
        tutorial: entry.tutorial,
        toolCall: entry.toolCall,
        toolResult: compactToolResult(entry.toolResult, includeRaw)
      }))
    },
    null,
    2
  );
}
