import type { AgentMission } from "../agent-types.js";

function completionReason(value: string) {
  return String(value || "").trim().slice(0, 1200) || "Agent completed the scoped mission.";
}

export function reconcileCompletedAgentMission(
  mission: AgentMission,
  now = mission.updatedAt
): AgentMission {
  return {
    ...mission,
    objectives: mission.objectives.map((objective) =>
      objective.status === "planned" || objective.status === "active"
        ? { ...objective, status: "completed" as const, updatedAt: now }
        : objective
    ),
    hypotheses: mission.hypotheses.map((hypothesis) =>
      hypothesis.status === "testing"
        ? { ...hypothesis, status: "open" as const, updatedAt: now }
        : hypothesis
    ),
    experiments: mission.experiments.map((experiment) => {
      if (experiment.status === "running") {
        return { ...experiment, status: "completed" as const, updatedAt: now };
      }
      return experiment.status === "planned"
        ? { ...experiment, status: "skipped" as const, updatedAt: now }
        : experiment;
    }),
    coverage: mission.coverage.map((cell) =>
      cell.status === "planned" || cell.status === "testing"
        ? { ...cell, status: "untested" as const, updatedAt: now }
        : cell
    ),
    operatorQuestions: mission.operatorQuestions.map((question) =>
      question.status === "open"
        ? { ...question, status: "dismissed" as const, updatedAt: now }
        : question
    )
  };
}

export function completeAgentMission(
  current: AgentMission,
  stopReason: string,
  now = new Date().toISOString()
): AgentMission {
  return reconcileCompletedAgentMission(
    {
      ...current,
      revision: current.revision + 1,
      status: "completed",
      stopReason: completionReason(stopReason),
      updatedAt: now
    },
    now
  );
}
