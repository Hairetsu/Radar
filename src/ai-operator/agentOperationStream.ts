import type { AgentRun, AgentTimelineEntry } from "../types";

export type AgentOperationStatus =
  | "active"
  | "blocked"
  | "failed"
  | "completed"
  | "requested"
  | "recorded";

export type AgentOperationGroup = {
  id: string;
  entries: AgentTimelineEntry[];
  decision?: AgentTimelineEntry;
  call?: AgentTimelineEntry;
  result?: AgentTimelineEntry;
  latest: AgentTimelineEntry;
  status: AgentOperationStatus;
  tool: string;
  title: string;
};

export type AgentOperationStreamItem =
  | { kind: "operation"; id: string; latestAt: string; operation: AgentOperationGroup }
  | { kind: "marker"; id: string; latestAt: string; entry: AgentTimelineEntry };

function entryTool(entry: AgentTimelineEntry): string {
  return entry.toolCall?.tool || entry.toolResult?.tool || "";
}

function isOperationEntry(entry: AgentTimelineEntry): boolean {
  return Boolean(
    entry.operationId ||
      entry.toolCall ||
      entry.toolResult ||
      entry.reconReport ||
      entry.phase === "tool-call" ||
      entry.phase === "tool-result" ||
      entry.phase === "policy-block" ||
      entry.phase === "failure"
  );
}

function canAcceptLegacyEntry(entries: AgentTimelineEntry[], entry: AgentTimelineEntry): boolean {
  const tool = entryTool(entry);
  if (!tool || entries.length === 0) return false;
  const groupTool = entries.map(entryTool).find(Boolean) || "";
  if (groupTool !== tool) return false;
  const hasResult = entries.some((item) => Boolean(item.toolResult) || item.phase === "tool-result");
  return !hasResult;
}

function operationStatus(
  entries: AgentTimelineEntry[],
  runStatus: AgentRun["status"],
  isLatestOperation: boolean
): AgentOperationStatus {
  if (entries.some((entry) => entry.phase === "policy-block")) return "blocked";
  if (entries.some((entry) => entry.phase === "failure" || (entry.toolResult && !entry.toolResult.ok))) {
    return "failed";
  }
  if (entries.some((entry) => entry.toolResult?.ok || entry.phase === "tool-result")) return "completed";
  if (isLatestOperation && (runStatus === "running" || runStatus === "queued")) return "active";
  if (entries.some((entry) => entry.toolCall || entry.phase === "tool-call")) return "requested";
  return "recorded";
}

function operationTitle(entries: AgentTimelineEntry[], tool: string): string {
  const decision = entries.find((entry) => entry.phase === "decision");
  const result = [...entries].reverse().find((entry) => Boolean(entry.toolResult) || entry.phase === "tool-result");
  return (
    decision?.summary ||
    decision?.note ||
    result?.summary ||
    result?.note ||
    entries[0]?.summary ||
    entries[0]?.note ||
    (tool ? `${tool} operation` : "Recorded operation")
  );
}

function buildOperation(
  id: string,
  entries: AgentTimelineEntry[],
  runStatus: AgentRun["status"],
  isLatestOperation: boolean
): AgentOperationGroup {
  const decision = entries.find((entry) => entry.phase === "decision" && Boolean(entry.toolCall)) ||
    entries.find((entry) => entry.phase === "decision");
  const call = entries.find((entry) => entry.phase === "tool-call") ||
    entries.find((entry) => Boolean(entry.toolCall));
  const result = [...entries].reverse().find(
    (entry) => Boolean(entry.toolResult) || entry.phase === "tool-result" || entry.phase === "failure" || entry.phase === "policy-block"
  );
  const latest = entries.at(-1) || entries[0];
  const tool = entryTool(call || result || decision || latest);
  return {
    id,
    entries,
    decision,
    call,
    result,
    latest,
    status: operationStatus(entries, runStatus, isLatestOperation),
    tool,
    title: operationTitle(entries, tool)
  };
}

export function projectAgentOperationStream(run: AgentRun): AgentOperationStreamItem[] {
  const grouped = new Map<string, AgentTimelineEntry[]>();
  const ordered: Array<{ kind: "operation"; id: string } | { kind: "marker"; entry: AgentTimelineEntry }> = [];
  let openLegacyId = "";

  for (const entry of run.timeline) {
    if (!isOperationEntry(entry)) {
      ordered.push({ kind: "marker", entry });
      openLegacyId = "";
      continue;
    }

    let groupId = entry.operationId || "";
    if (!groupId && openLegacyId && canAcceptLegacyEntry(grouped.get(openLegacyId) || [], entry)) {
      groupId = openLegacyId;
    }
    if (!groupId) {
      groupId = `legacy:${entry.id}`;
    }
    if (!grouped.has(groupId)) {
      grouped.set(groupId, []);
      ordered.push({ kind: "operation", id: groupId });
    }
    grouped.get(groupId)?.push(entry);

    const closesOperation = Boolean(entry.toolResult) || entry.phase === "tool-result" || entry.phase === "failure" || entry.phase === "policy-block";
    openLegacyId = entry.operationId || closesOperation ? "" : groupId;
  }

  const operationOrder = ordered.filter(
    (item): item is { kind: "operation"; id: string } => item.kind === "operation"
  );
  const latestOperationId = operationOrder.at(-1)?.id || "";

  return ordered.map<AgentOperationStreamItem>((item) => {
    if (item.kind === "marker") {
      return {
        kind: "marker",
        id: item.entry.id,
        latestAt: item.entry.createdAt,
        entry: item.entry
      };
    }
    const operation = buildOperation(
      item.id,
      grouped.get(item.id) || [],
      run.status,
      item.id === latestOperationId
    );
    return {
      kind: "operation",
      id: item.id,
      latestAt: operation.latest.createdAt,
      operation
    };
  }).reverse();
}

export function defaultExpandedOperationIds(items: AgentOperationStreamItem[]): Set<string> {
  const expanded = new Set<string>();
  const operations = items.filter(
    (item): item is Extract<AgentOperationStreamItem, { kind: "operation" }> => item.kind === "operation"
  );
  const current = operations.find((item) => item.operation.status === "active" || item.operation.status === "requested");
  const completed = operations.find((item) => item.operation.status === "completed");
  if (current) expanded.add(current.id);
  if (completed) expanded.add(completed.id);
  for (const item of operations) {
    if (item.operation.status === "failed" || item.operation.status === "blocked") {
      expanded.add(item.id);
    }
  }
  return expanded;
}
