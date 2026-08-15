import { describe, expect, it } from "vitest";
import type { AgentMission } from "./agent-types.js";
import {
  AGENT_MISSION_LIMITS,
  applyAgentMissionPatch,
  applyAgentMissionSteering,
  applyAgentMissionUpdates,
  completeAgentMission,
  createAgentMission,
  missionHasOpenQuestion,
  normalizeAgentMission,
  normalizeAgentMissionPatch,
  normalizeAgentMissionSteeringRequest,
  normalizeAgentMissionUpdates,
  validateAgentMissionEvidence
} from "./agentMission.js";

const NOW = "2026-07-10T12:00:00.000Z";
const LATER = "2026-07-10T12:01:00.000Z";

function missionWithHypothesis(): AgentMission {
  const mission = createAgentMission("Review tenant isolation", "https://target.test/account", NOW);
  const result = applyAgentMissionPatch(
    mission,
    {
      baseRevision: 0,
      updates: [
        {
          kind: "hypothesis",
          id: "hyp-tenant",
          objectiveId: "obj-primary",
          statement: "Tenant B may read Tenant A invoices.",
          rationale: "Observed object identifiers.",
          status: "open",
          priority: 2
        }
      ]
    },
    LATER
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.mission;
}

describe("agent mission graph", () => {
  it("normalizes complete stored graph records, invalid rows, duplicate ids, and open questions", () => {
    expect(normalizeAgentMission(null, "", "", NOW)).toMatchObject({
      goal: "Review the authorized target.",
      coverage: []
    });
    const normalized = normalizeAgentMission(
      {
        version: 1,
        revision: 3.7,
        goal: "",
        status: "completed",
        stopReason: "Stored stop reason",
        createdAt: NOW,
        updatedAt: LATER,
        objectives: [
          { id: "obj one", title: "Primary", description: "Desc", status: "completed", priority: 2, createdAt: NOW },
          { id: "obj one", title: "Duplicate" },
          { id: "invalid", title: "" }
        ],
        hypotheses: [
          { id: "hyp-one", objectiveId: "obj-one", statement: "Linked hypothesis", rationale: "Reason", status: "testing", priority: 1, pinned: true, evidenceRefs: ["capture:1"], createdAt: NOW },
          { statement: "Orphan hypothesis" },
          { statement: "" }
        ],
        experiments: [
          { id: "exp-one", hypothesisId: "hyp-one", title: "Linked experiment", method: "GET", expectedObservation: "200", status: "running", evidenceRefs: ["capture:1"] },
          { title: "Unlinked experiment" },
          { title: "" }
        ],
        claims: [
          { id: "claim-one", hypothesisId: "hyp-one", statement: "Linked claim", status: "lead", confidence: "high", evidenceRefs: ["capture:1"] },
          { statement: "Unlinked claim" },
          { statement: "" }
        ],
        coverage: [
          { id: "gap-one", dimension: "endpoint", label: "GET /api", status: "testing", evidenceRefs: ["capture:1"] },
          { dimension: "unknown", label: "Fallback dimension" },
          { label: "" }
        ],
        operatorQuestions: [
          { id: "ask-one", prompt: "Open question", status: "open" },
          { prompt: "Answered question", status: "answered", answer: "Yes", createdAt: NOW, updatedAt: LATER },
          { prompt: "" }
        ]
      },
      "Fallback",
      "https://target.test",
      NOW
    );

    expect(normalized).toMatchObject({
      revision: 4,
      goal: "Fallback",
      status: "completed",
      stopReason: "Stored stop reason",
      updatedAt: LATER
    });
    expect(normalized.objectives).toHaveLength(1);
    expect(normalized.hypotheses).toHaveLength(2);
    expect(normalized.experiments).toHaveLength(2);
    expect(normalized.claims).toHaveLength(2);
    expect(normalized.coverage).toHaveLength(2);
    expect(normalized.hypotheses[0]).toMatchObject({ id: "hyp-one", status: "open" });
    expect(normalized.experiments[0]).toMatchObject({ id: "exp-one", status: "completed" });
    expect(normalized.coverage[0]).toMatchObject({ id: "gap-one", status: "untested" });
    expect(normalized.operatorQuestions[0]).toMatchObject({ status: "dismissed" });
    expect(normalized.operatorQuestions[1]).toMatchObject({ status: "answered", answer: "Yes" });
  });

  it("normalizes every bounded planner update kind and rejects empty patch shapes", () => {
    const updates = normalizeAgentMissionUpdates([
      { kind: "objective", id: "obj-two", title: "Second", description: "Desc", status: "active", priority: 1 },
      { kind: "objective", title: "" },
      { kind: "hypothesis", id: "hyp-two", objectiveId: "obj-two", statement: "Hypothesis", rationale: "Why", status: "testing", priority: 2, evidenceRefs: ["capture:1"] },
      { kind: "hypothesis", statement: "" },
      { kind: "experiment", id: "exp-two", hypothesisId: "hyp-two", title: "Experiment", method: "Replay", expectedObservation: "403", status: "running", evidenceRefs: ["capture:1"] },
      { kind: "experiment", title: "" },
      { kind: "claim", id: "clm-two", hypothesisId: "hyp-two", statement: "Claim", status: "lead", confidence: "medium", evidenceRefs: ["capture:1"] },
      { kind: "claim", statement: "" },
      { kind: "coverage", id: "gap-two", dimension: "endpoint", label: "POST /api", status: "testing", evidenceRefs: ["capture:1"] },
      { kind: "coverage", label: "" },
      { kind: "operator-question", id: "ask-two", prompt: "Choose identity" },
      { kind: "operator-question", prompt: "" },
      { kind: "mission-status", status: "stopped", stopReason: "Done" },
      { kind: "mission-status", status: "invalid" }
    ]);

    expect(updates.map((update) => update.kind)).toEqual([
      "objective",
      "hypothesis",
      "experiment",
      "claim",
      "coverage",
      "operator-question",
      "mission-status"
    ]);
    expect(normalizeAgentMissionUpdates(null)).toEqual([]);
    expect(normalizeAgentMissionPatch({})).toBeUndefined();
    expect(normalizeAgentMissionPatch({ baseRevision: 0, updates: [] })).toBeUndefined();
  });

  it("applies and then updates every mission entity without losing operator-owned fields", () => {
    const current = createAgentMission("Review target", "", NOW);
    const created = applyAgentMissionPatch(
      current,
      {
        baseRevision: 0,
        updates: [
          { kind: "objective", id: "obj-primary", title: "Review target", description: "Expanded", priority: 5 },
          { kind: "hypothesis", id: "hyp-all", objectiveId: "obj-primary", statement: "All entities", priority: 2 },
          { kind: "experiment", id: "exp-all", hypothesisId: "hyp-all", title: "Test all entities" },
          { kind: "claim", id: "clm-all", hypothesisId: "hyp-all", statement: "Candidate claim" },
          { kind: "coverage", id: "gap-all", dimension: "control", label: "All controls" },
          { kind: "operator-question", id: "ask-all", prompt: "Continue?" },
          { kind: "mission-status", status: "active" }
        ]
      },
      LATER
    );
    if (!created.ok) throw new Error(created.error);
    expect(created.mission).toMatchObject({
      revision: 1,
      objectives: [expect.objectContaining({ id: "obj-primary", priority: 1, description: "Expanded" })],
      hypotheses: [expect.objectContaining({ id: "hyp-all", priority: 2, pinned: false })],
      experiments: [expect.objectContaining({ id: "exp-all" })],
      claims: [expect.objectContaining({ id: "clm-all" })],
      coverage: [expect.objectContaining({ id: "gap-all" })],
      operatorQuestions: [expect.objectContaining({ id: "ask-all" })]
    });

    const updated = applyAgentMissionUpdates(
      created.mission,
      [
        { kind: "hypothesis", id: "hyp-all", statement: "Updated hypothesis", priority: 5, status: "testing" },
        { kind: "experiment", id: "exp-all", title: "Updated experiment", status: "blocked" },
        { kind: "claim", id: "clm-all", statement: "Updated claim", status: "contradicted" },
        { kind: "coverage", id: "gap-all", dimension: "control", label: "Updated control", status: "blocked" },
        { kind: "operator-question", id: "ask-all", prompt: "Updated question?" }
      ],
      "2026-07-10T12:02:00.000Z"
    );
    expect(updated).toMatchObject({
      revision: 2,
      hypotheses: [expect.objectContaining({ statement: "Updated hypothesis", priority: 2 })],
      experiments: [expect.objectContaining({ title: "Updated experiment", status: "blocked" })],
      claims: [expect.objectContaining({ statement: "Updated claim", status: "contradicted" })],
      coverage: [expect.objectContaining({ label: "Updated control", status: "blocked" })],
      operatorQuestions: [expect.objectContaining({ prompt: "Updated question?", status: "open" })]
    });
    expect(applyAgentMissionUpdates(updated, [], LATER)).toEqual(updated);
  });

  it("settles transient graph states when the run completes without overstating evidence", () => {
    const current = applyAgentMissionUpdates(
      createAgentMission("Review target", "https://target.test", NOW),
      [
        {
          kind: "hypothesis",
          id: "hyp-review",
          objectiveId: "obj-primary",
          statement: "The target may expose hardening gaps.",
          status: "testing"
        },
        {
          kind: "experiment",
          id: "exp-running",
          hypothesisId: "hyp-review",
          title: "Analyze observed headers",
          status: "running"
        },
        {
          kind: "experiment",
          id: "exp-planned",
          hypothesisId: "hyp-review",
          title: "Compare authenticated behavior",
          status: "planned"
        },
        {
          kind: "experiment",
          id: "exp-failed",
          hypothesisId: "hyp-review",
          title: "Inspect unavailable endpoint",
          status: "failed"
        },
        {
          kind: "coverage",
          id: "gap-control",
          dimension: "control",
          label: "Browser headers",
          status: "testing"
        },
        { kind: "operator-question", id: "ask-report", prompt: "Include this lead?" }
      ],
      LATER
    );

    const completed = completeAgentMission(
      current,
      "Scoped review finished.",
      "2026-07-10T12:02:00.000Z"
    );

    expect(completed).toMatchObject({
      revision: current.revision + 1,
      status: "completed",
      stopReason: "Scoped review finished.",
      objectives: [expect.objectContaining({ status: "completed" })],
      hypotheses: [expect.objectContaining({ id: "hyp-review", status: "open" })],
      experiments: [
        expect.objectContaining({ id: "exp-running", status: "completed" }),
        expect.objectContaining({ id: "exp-planned", status: "skipped" }),
        expect.objectContaining({ id: "exp-failed", status: "failed" })
      ],
      coverage: [
        expect.objectContaining({ dimension: "host", status: "untested" }),
        expect.objectContaining({ id: "gap-control", status: "untested" })
      ],
      operatorQuestions: [expect.objectContaining({ id: "ask-report", status: "dismissed" })]
    });
  });

  it("normalizes invalid steering shapes and covers objective, hypothesis, dismiss, and missing-item paths", () => {
    expect(normalizeAgentMissionSteeringRequest(null)).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "add-objective", title: "" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "add-hypothesis", statement: "" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "update-item", entity: "unknown", id: "x" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "ask-operator", prompt: "" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "answer-operator", questionId: "", answer: "" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "dismiss-operator", questionId: "" })).toBeNull();
    expect(normalizeAgentMissionSteeringRequest({ action: "unknown" })).toBeNull();

    let mission = createAgentMission("Review", "", NOW);
    const objective = applyAgentMissionSteering(mission, {
      action: "add-objective",
      expectedRevision: 0,
      title: "Secondary",
      description: "Operator branch",
      priority: 2
    }, LATER);
    if (!objective.ok) throw new Error(objective.error);
    mission = objective.mission;
    const hypothesis = applyAgentMissionSteering(mission, {
      action: "add-hypothesis",
      expectedRevision: mission.revision,
      statement: "Secondary hypothesis",
      objectiveId: mission.objectives[1]?.id,
      rationale: "Operator lead",
      priority: 1
    }, LATER);
    if (!hypothesis.ok) throw new Error(hypothesis.error);
    mission = hypothesis.mission;

    expect(applyAgentMissionSteering(mission, { action: "update-item", expectedRevision: mission.revision, entity: "claim", id: "missing", status: "lead" })).toMatchObject({ ok: false, error: "Mission item was not found." });
    expect(applyAgentMissionSteering(mission, { action: "dismiss-operator", expectedRevision: mission.revision, questionId: "missing" })).toMatchObject({ ok: false, error: "Mission operator question was not found." });
    expect(applyAgentMissionSteering(mission, { action: "unknown", expectedRevision: mission.revision })).toMatchObject({ ok: false, error: "Mission steering request was invalid." });

    const firstAsk = applyAgentMissionSteering(mission, { action: "ask-operator", expectedRevision: mission.revision, prompt: "First?" }, LATER);
    if (!firstAsk.ok) throw new Error(firstAsk.error);
    const secondAsk = applyAgentMissionSteering(firstAsk.mission, { action: "ask-operator", expectedRevision: firstAsk.mission.revision, prompt: "Second?" }, LATER);
    if (!secondAsk.ok) throw new Error(secondAsk.error);
    const dismissed = applyAgentMissionSteering(secondAsk.mission, {
      action: "dismiss-operator",
      expectedRevision: secondAsk.mission.revision,
      questionId: secondAsk.mission.operatorQuestions[0]?.id || ""
    }, LATER);
    expect(dismissed).toMatchObject({ ok: true, mission: { status: "awaiting-operator" }, summary: expect.stringContaining("dismissed") });
  });

  it("creates a deterministic root objective and explicit target coverage", () => {
    const mission = createAgentMission("Review tenant isolation", "https://target.test/account", NOW);

    expect(mission).toMatchObject({
      version: 1,
      revision: 0,
      goal: "Review tenant isolation",
      status: "active"
    });
    expect(mission.objectives).toEqual([
      expect.objectContaining({ id: "obj-primary", status: "active", priority: 1, createdAt: NOW })
    ]);
    expect(mission.coverage).toEqual([
      expect.objectContaining({ dimension: "host", label: "https://target.test", status: "planned" })
    ]);
  });

  it("normalizes malformed stored graphs and caps every collection", () => {
    const normalized = normalizeAgentMission(
      {
        version: 1,
        revision: -4,
        goal: "Stored mission",
        status: "unknown",
        createdAt: "invalid",
        objectives: Array.from({ length: AGENT_MISSION_LIMITS.objectives + 4 }, (_, index) => ({
          id: `obj-${index}`,
          title: `Objective ${index}`,
          priority: 99
        })),
        hypotheses: [{ id: "bad", statement: "", pinned: true }],
        experiments: [],
        claims: [],
        coverage: [],
        operatorQuestions: []
      },
      "Fallback goal",
      "",
      NOW
    );

    expect(normalized.revision).toBe(0);
    expect(normalized.status).toBe("active");
    expect(normalized.objectives).toHaveLength(AGENT_MISSION_LIMITS.objectives);
    expect(normalized.objectives[0]?.priority).toBe(5);
    expect(normalized.hypotheses).toEqual([]);
    expect(normalized.createdAt).toBe(NOW);
  });

  it("normalizes bounded planner updates without granting pin control", () => {
    const updates = normalizeAgentMissionUpdates([
      {
        kind: "hypothesis",
        id: "hyp-auth",
        objectiveId: "obj-primary",
        statement: "  Authorization may be inconsistent.  ",
        priority: 900,
        pinned: true,
        evidenceRefs: ["capture:1", "capture:1"]
      },
      { kind: "unknown", title: "ignored" }
    ]);

    expect(updates).toEqual([
      {
        kind: "hypothesis",
        id: "hyp-auth",
        objectiveId: "obj-primary",
        statement: "Authorization may be inconsistent.",
        priority: 5,
        evidenceRefs: ["capture:1"]
      }
    ]);
    expect(updates[0]).not.toHaveProperty("pinned");
  });

  it("applies planner patches atomically and rejects stale or broken references", () => {
    const current = createAgentMission("Review target", "https://target.test", NOW);
    const accepted = applyAgentMissionPatch(
      current,
      {
        baseRevision: 0,
        updates: [
          {
            kind: "hypothesis",
            id: "hyp-auth",
            objectiveId: "obj-primary",
            statement: "Authorization may be inconsistent."
          }
        ]
      },
      LATER
    );

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(accepted.mission.revision).toBe(1);
    expect(accepted.mission.hypotheses).toHaveLength(1);

    expect(
      applyAgentMissionPatch(accepted.mission, { baseRevision: 0, updates: [{ kind: "coverage", label: "/api", dimension: "endpoint" }] }, LATER)
    ).toMatchObject({ ok: false, error: expect.stringContaining("expected revision 0") });

    expect(
      applyAgentMissionPatch(
        current,
        {
          baseRevision: 0,
          updates: [{ kind: "experiment", id: "exp-1", hypothesisId: "missing", title: "Try request" }]
        },
        LATER
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining("invalid references") });
    expect(current.experiments).toEqual([]);
  });

  it("keeps pinning and priority under revision-checked operator steering", () => {
    const current = missionWithHypothesis();
    const result = applyAgentMissionSteering(
      current,
      {
        action: "update-item",
        expectedRevision: current.revision,
        entity: "hypothesis",
        id: "hyp-tenant",
        priority: 1,
        pinned: true,
        status: "testing"
      },
      "2026-07-10T12:02:00.000Z"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.mission.revision).toBe(2);
    expect(result.mission.hypotheses[0]).toMatchObject({ priority: 1, pinned: true, status: "testing" });
    expect(
      applyAgentMissionSteering(result.mission, {
        action: "update-item",
        expectedRevision: 1,
        entity: "hypothesis",
        id: "hyp-tenant",
        status: "supported"
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("expected revision 1") });
  });

  it("pauses for an operator question and records a revision-checked answer", () => {
    const current = missionWithHypothesis();
    const asked = applyAgentMissionSteering(
      current,
      {
        action: "ask-operator",
        expectedRevision: current.revision,
        prompt: "Which tenant identity should be the control?"
      },
      "2026-07-10T12:02:00.000Z"
    );

    expect(asked.ok).toBe(true);
    if (!asked.ok) {
      return;
    }
    expect(asked.shouldPause).toBe(true);
    expect(asked.mission.status).toBe("awaiting-operator");
    expect(missionHasOpenQuestion(asked.mission)).toBe(true);

    const questionId = asked.mission.operatorQuestions[0]?.id || "";
    const answered = applyAgentMissionSteering(
      asked.mission,
      {
        action: "answer-operator",
        expectedRevision: asked.mission.revision,
        questionId,
        answer: "Use Tenant A as control and Tenant B as the challenger."
      },
      "2026-07-10T12:03:00.000Z"
    );

    expect(answered.ok).toBe(true);
    if (!answered.ok) {
      return;
    }
    expect(answered.mission.status).toBe("active");
    expect(answered.mission.operatorQuestions[0]).toMatchObject({
      status: "answered",
      answer: "Use Tenant A as control and Tenant B as the challenger."
    });
  });

  it("rejects status and field mutations that do not belong to the selected entity", () => {
    const current = missionWithHypothesis();
    expect(
      applyAgentMissionSteering(current, {
        action: "update-item",
        expectedRevision: current.revision,
        entity: "coverage",
        id: current.coverage[0]?.id,
        status: "supported"
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("invalid for coverage") });
    expect(
      applyAgentMissionSteering(current, {
        action: "update-item",
        expectedRevision: current.revision,
        entity: "coverage",
        id: current.coverage[0]?.id,
        priority: 1
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("Only objectives and hypotheses") });
  });

  it("requires locally resolvable evidence for supported hypotheses, claims, and covered cells", () => {
    const current = missionWithHypothesis();
    const patched = applyAgentMissionPatch(
      current,
      {
        baseRevision: current.revision,
        updates: [
          { kind: "hypothesis", id: "hyp-tenant", statement: "Tenant B may read Tenant A invoices.", status: "supported" },
          { kind: "claim", id: "clm-tenant", hypothesisId: "hyp-tenant", statement: "Tenant isolation is bypassed.", status: "supported" },
          { kind: "coverage", id: "gap-endpoint", dimension: "endpoint", label: "GET /invoices/:id", status: "covered", evidenceRefs: ["capture:missing"] }
        ]
      },
      "2026-07-10T12:04:00.000Z"
    );
    if (!patched.ok) throw new Error(patched.error);

    expect(validateAgentMissionEvidence(patched.mission, new Set(["capture:1"]))).toEqual([
      "coverage gap-endpoint: evidence reference \"capture:missing\" is not present in the local evidence catalog",
      "hypothesis hyp-tenant: supported status requires evidence",
      "claim clm-tenant: supported status requires evidence"
    ]);
  });
});
