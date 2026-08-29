import { describe, expect, it } from "vitest";
import type { AgentFinding, AgentRun } from "./agent-types";
import { findingFollowUpDigest, findingFollowUpSeedPrompt, normalizeAgentRunSource } from "./agentFollowUp";

const finding: AgentFinding = {
  id: "finding-sqli",
  createdAt: "2026-05-25T00:01:00.000Z",
  title: "Cargo search accepts a Boolean bypass",
  confidence: "medium",
  evidenceRefs: ["capture:search-1"],
  notes: "Repeater variants changed the result set.",
  affectedAssets: ["http://127.0.0.1:3000/api/cargo/search"],
  reproductionNotes: "Replay q with a Boolean pair.",
  severityRationale: "Unauthorized cargo rows were returned.",
  remediation: "Parameterize the cargo lookup.",
  uncertainties: ["Browser form validation still blocks the payload."]
};

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-source",
    sessionId: "session-1",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:02:00.000Z",
    goal: "Inspect Harborline cargo search",
    profileId: "browser-assessment",
    status: "completed",
    policy: {
      maxRuntimeMs: 120_000,
      maxSteps: 8,
      maxReplay: 1,
      maxWorkflowRequests: 0,
      maxCaptureSample: 20,
      allowRawContext: false
    },
    timeline: [
      {
        id: "completion-1",
        createdAt: "2026-05-25T00:02:00.000Z",
        phase: "status",
        summary: "Completion report ready",
        completionReport: {
          generatedAt: "2026-05-25T00:02:00.000Z",
          outcome: "draft-findings",
          findingCount: 1,
          rejectedFindingCount: 0,
          operationCount: 4,
          evidenceRefs: ["capture:search-1"],
          executiveSummary: "Cargo search returned extra rows for a Boolean pair.",
          scopeSummary: "Harborline cargo search.",
          methodology: ["Captured a normal search.", "Replayed a Boolean pair."],
          observations: [
            {
              title: "Boolean pair expanded the result set",
              detail: "The mutated query returned internal cargo fields.",
              status: "supported",
              confidence: "medium",
              evidenceRefs: ["capture:search-1"]
            }
          ],
          limitations: ["No confirming second probe."],
          recommendations: ["Retest through the browser after relaxing client validation."]
        }
      }
    ],
    findings: [finding],
    ...overrides
  };
}

describe("agent finding follow-up", () => {
  it("normalizes continuation and finding sources and drops incomplete records", () => {
    expect(normalizeAgentRunSource({ kind: "continuation", sourceRunId: " run-1 " })).toEqual({
      kind: "continuation",
      sourceRunId: "run-1"
    });
    expect(
      normalizeAgentRunSource({
        kind: "finding-follow-up",
        sourceRunId: "run-1",
        sourceFindingId: " finding-sqli "
      })
    ).toEqual({
      kind: "finding-follow-up",
      sourceRunId: "run-1",
      sourceFindingId: "finding-sqli"
    });
    expect(normalizeAgentRunSource({ kind: "finding-follow-up", sourceRunId: "run-1" })).toBeUndefined();
    expect(normalizeAgentRunSource({ kind: "unknown", sourceRunId: "run-1" })).toBeUndefined();
  });

  it("builds a digest from the source finding and related observations", () => {
    const digest = findingFollowUpDigest(run(), "finding-sqli");
    expect(digest).toEqual(
      expect.objectContaining({
        kind: "finding-follow-up",
        sourceRunId: "run-source",
        sourceGoal: "Inspect Harborline cargo search",
        completionSummary: "Cargo search returned extra rows for a Boolean pair.",
        finding,
        relatedObservations: [
          expect.objectContaining({
            title: "Boolean pair expanded the result set",
            evidenceRefs: ["capture:search-1"]
          })
        ]
      })
    );
    expect(findingFollowUpDigest(run(), "missing")).toBeNull();
    expect(findingFollowUpSeedPrompt(finding)).toContain("Cargo search accepts a Boolean bypass");
    expect(findingFollowUpSeedPrompt(finding)).toContain("http://127.0.0.1:3000/api/cargo/search");
    expect(findingFollowUpSeedPrompt(finding)).toContain("capture:search-1");
  });
});
