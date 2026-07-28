import type { AgentRun, AgentTimelineEntry } from "../types";

export function lastIndexMatching(entries: AgentTimelineEntry[], predicate: (entry: AgentTimelineEntry) => boolean) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index])) {
      return index;
    }
  }
  return -1;
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

