import { describe, expect, it } from "vitest";
import type { AgentMission, AgentRun } from "./agent-types.js";
import { buildAgentCompletionReport, completionReportForRun } from "./agentReport.js";

const createdAt = "2026-08-15T00:00:00.000Z";

function mission(overrides: Partial<AgentMission> = {}): AgentMission {
  return {
    version: 1,
    revision: 1,
    goal: "Inspect target.test",
    status: "completed",
    createdAt,
    updatedAt: createdAt,
    objectives: [],
    hypotheses: [],
    experiments: [],
    claims: [],
    coverage: [],
    operatorQuestions: [],
    ...overrides
  };
}

describe("agent completion reports", () => {
  it("keeps only evidence-backed report observations and preserves explicit limitations", () => {
    const report = buildAgentCompletionReport({
      decisionReport: {
        executiveSummary: "One public hardening observation was retained.",
        scopeSummary: "Public document responses only.",
        methodology: ["Reviewed captured response headers."],
        observations: [
          {
            title: "Supported header observation",
            detail: "The retained document response omitted the expected header.",
            status: "supported",
            confidence: "medium",
            evidenceRefs: ["capture:home"]
          },
          {
            title: "Unsupported observation",
            detail: "This citation does not resolve.",
            status: "lead",
            confidence: "low",
            evidenceRefs: ["capture:missing"]
          }
        ],
        limitations: ["No authenticated identity was available."],
        recommendations: ["Retest the authenticated state."]
      },
      rationale: "Done.",
      goal: "Inspect target.test",
      allowlist: ["https://target.test"],
      mission: mission(),
      findings: [],
      rejectedFindingCount: 1,
      generatedAt: createdAt,
      timeline: [],
      evidenceCatalog: new Set(["capture:home"])
    });

    expect(report.outcome).toBe("observations-only");
    expect(report.observations.map((observation) => observation.title)).toEqual([
      "Supported header observation"
    ]);
    expect(report.rejectedFindingCount).toBe(1);
    expect(report.limitations).toContain("No authenticated identity was available.");
    expect(report.limitations.at(-1)).toContain("does not prove");
  });

  it("reconstructs a conservative write-up for an older completed run", () => {
    const run: AgentRun = {
      id: "run-old",
      sessionId: "session-1",
      createdAt,
      updatedAt: "2026-08-15T00:01:00.000Z",
      goal: "Inspect target.test",
      profileId: "passive-map",
      status: "completed",
      policy: {
        maxRuntimeMs: 60_000,
        maxSteps: 4,
        maxReplay: 0,
        maxWorkflowRequests: 0,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      checkpoint: {
        startUrl: "https://target.test",
        targetOrigin: "https://target.test",
        stepCount: 1,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 1_000,
        lastResumedAt: createdAt
      },
      mission: mission({
        claims: [{
          id: "claim-cookie",
          statement: "No Set-Cookie response was observed in public traffic.",
          status: "supported",
          confidence: "medium",
          evidenceRefs: ["capture:home"],
          createdAt,
          updatedAt: createdAt
        }],
        coverage: [{
          id: "coverage-identity",
          dimension: "identity",
          label: "Authenticated identity",
          status: "untested",
          evidenceRefs: [],
          createdAt,
          updatedAt: createdAt
        }]
      }),
      timeline: [{
        id: "step-finish",
        createdAt,
        operationId: "operation-1",
        phase: "status",
        note: "Public inspection completed."
      }],
      findings: []
    };

    const report = completionReportForRun(run);

    expect(report).toMatchObject({
      outcome: "observations-only",
      executiveSummary: "Public inspection completed.",
      observations: [expect.objectContaining({
        title: "No Set-Cookie response was observed in public traffic.",
        evidenceRefs: ["capture:home"]
      })]
    });
    expect(report?.limitations).toContain("identity: Authenticated identity remained untested.");
  });
});
