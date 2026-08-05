import type { AgentRun, AgentTimelineEntry } from "../types";

export type AgentThoughtstreamStepStatus =
  | "planning"
  | "requested"
  | "completed"
  | "failed";

export type AgentThoughtstreamStep = {
  tool: string;
  status: AgentThoughtstreamStepStatus;
  rationaleEntry?: AgentTimelineEntry;
  targetEntry?: AgentTimelineEntry;
};

export function lastIndexMatching(entries: AgentTimelineEntry[], predicate: (entry: AgentTimelineEntry) => boolean) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index])) {
      return index;
    }
  }
  return -1;
}

function entryTool(entry: AgentTimelineEntry | undefined) {
  return entry?.toolCall?.tool || entry?.toolResult?.tool || "";
}

function isCompletedToolEntry(entry: AgentTimelineEntry) {
  return entry.phase === "tool-result" || entry.phase === "failure" || Boolean(entry.toolResult);
}

function isStepRationaleEntry(entry: AgentTimelineEntry) {
  return Boolean(
    entry.toolCall &&
      (entry.phase === "decision" || (entry.phase === "policy-block" && !entry.toolResult))
  );
}

function toolStatus(entry: AgentTimelineEntry): AgentThoughtstreamStepStatus {
  if (entry.toolResult) {
    return entry.toolResult.ok ? "completed" : "failed";
  }
  if (entry.phase === "failure") {
    return "failed";
  }
  return "requested";
}

export function agentThoughtstreamStep(entries: AgentTimelineEntry[]): AgentThoughtstreamStep {
  const activityIndex = lastIndexMatching(
    entries,
    (entry) => Boolean(entry.toolCall || entry.toolResult)
  );
  if (activityIndex < 0) {
    return { tool: "planner", status: "planning" };
  }

  const activity = entries[activityIndex];
  const tool = entryTool(activity) || "planner";
  let rationaleEntry: AgentTimelineEntry | undefined;
  for (let index = activityIndex; index >= 0; index -= 1) {
    const entry = entries[index];
    if (index < activityIndex && isCompletedToolEntry(entry)) {
      break;
    }
    if (entryTool(entry) === tool && isStepRationaleEntry(entry)) {
      rationaleEntry = entry;
      break;
    }
  }

  return {
    tool,
    status: toolStatus(activity),
    rationaleEntry,
    targetEntry: rationaleEntry?.target ? rationaleEntry : activity
  };
}

export function targetText(entry?: AgentTimelineEntry) {
  if (!entry?.target) {
    return "Saved-scope evidence surface";
  }
  return [entry.target.view, entry.target.browserUrl, entry.target.evidenceId, entry.target.control]
    .filter(Boolean)
    .join(" / ");
}

export function activityLabel(run: AgentRun, decisionIndex: number, callIndex: number, resultIndex: number) {
  if (run.status === "paused") {
    return run.policy.tutorialMode ? "Lesson checkpoint" : "Awaiting operator";
  }
  if (run.status === "failed") return "Recovery needed";
  if (run.status === "completed") return "Mission complete";
  if (run.status === "stopped") return "Mission stopped";
  if (callIndex > resultIndex) return "Executing tool";
  if (decisionIndex > resultIndex) return "Decision committed";
  return "Planning next action";
}

export function resultText(entry: AgentTimelineEntry | undefined, waiting: boolean, run: AgentRun) {
  if (waiting && run.status === "paused") {
    return run.policy.tutorialMode
      ? "The lesson result is ready for review before the next decision."
      : "The selected action is waiting for operator review before dispatch.";
  }
  if (waiting) {
    return "Waiting for the bounded tool result before choosing the next step.";
  }
  if (!entry) {
    return "No tool result has been recorded yet.";
  }
  if (entry.toolResult) {
    return entry.toolResult.ok
      ? `${entry.toolResult.tool} completed successfully.`
      : `${entry.toolResult.tool} failed: ${entry.toolResult.error}`;
  }
  return entry.summary || entry.note || "The latest step was recorded.";
}
