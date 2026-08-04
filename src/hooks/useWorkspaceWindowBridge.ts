import { useEffect, useMemo, useRef } from "react";
import type {
  WorkspaceContextSnapshot,
  WorkspaceControlIntent,
  WorkspaceSelectionRef
} from "../../shared/windowCoordination.js";
import type { RadarWorkbench } from "./useRadarWorkbench";

function attentionCount(workbench: RadarWorkbench) {
  const run = workbench.activeAgentRun;
  if (!run) {
    return 0;
  }
  const pendingTimeline = run.timeline.filter((entry) =>
    entry.phase === "failure" ||
    entry.phase === "policy-block" ||
    Boolean(entry.recoveryActions?.length) ||
    Boolean(entry.toolResult?.ok && entry.toolResult.tool === "proposeRunMemory")
  ).length;
  return pendingTimeline + run.findings.length;
}

function selectionFor({
  activeView,
  selected,
  selectedFinding,
  selectedWorkflow,
  selectedAutomateResult
}: Pick<RadarWorkbench, "activeView" | "selected" | "selectedFinding" | "selectedWorkflow" | "selectedAutomateResult">): WorkspaceSelectionRef | null {
  if (activeView === "traffic" && selected) {
    return {
      kind: "capture",
      id: selected.id,
      label: `${selected.method} ${selected.url}`
    };
  }
  if (activeView === "findings" && selectedFinding) {
    return { kind: "finding", id: selectedFinding.id, label: selectedFinding.title };
  }
  if (activeView === "workflows" && selectedWorkflow) {
    return { kind: "workflow", id: selectedWorkflow.id, label: selectedWorkflow.name };
  }
  if (activeView === "automate" && selectedAutomateResult) {
    return {
      kind: "automate",
      id: selectedAutomateResult.id,
      label: selectedAutomateResult.request.url || selectedAutomateResult.id
    };
  }
  return null;
}

function revealSelection(
  intent: Extract<WorkspaceControlIntent, { type: "reveal-evidence" }>,
  workbench: RadarWorkbench,
  selectWebSocket: (id: string) => void
) {
  const { ref } = intent;
  if (ref.kind === "capture") {
    workbench.setSelectedId(ref.id);
    workbench.setSelectedIds([ref.id]);
    workbench.selectionAnchorRef.current = ref.id;
    workbench.setActiveView("traffic");
    return;
  }
  if (ref.kind === "websocket") {
    selectWebSocket(ref.id);
    workbench.setActiveView("websocket");
    return;
  }
  if (ref.kind === "finding") {
    workbench.setSelectedFindingId(ref.id);
    workbench.setActiveView("findings");
    return;
  }
  if (ref.kind === "workflow") {
    workbench.setSelectedWorkflowId(ref.id);
    workbench.setActiveView("workflows");
    return;
  }
  workbench.setSelectedAutomateResultId(ref.id);
  workbench.setActiveView("automate");
}

function applyWorkspaceIntent(
  intent: WorkspaceControlIntent,
  workbench: RadarWorkbench,
  selectWebSocket: (id: string) => void
) {
  if (intent.type === "show-view") {
    workbench.setActiveView(intent.view);
    return;
  }
  if (intent.type === "show-notice") {
    workbench.setNotice(intent.message);
    return;
  }
  if (intent.type === "propose-scope-origin") {
    const current = workbench.targetText.split("\n").map((item) => item.trim()).filter(Boolean);
    workbench.setTargetText([...new Set([...workbench.targets, ...current, intent.origin])].join("\n"));
    workbench.setActiveView("scope");
    workbench.setNotice(`Scope consent required: review ${intent.origin} in the Scope editor and Commit it before starting AI-First.`);
    return;
  }
  if (intent.type === "reveal-evidence") {
    revealSelection(intent, workbench, selectWebSocket);
    return;
  }
  if (intent.type === "reveal-timeline-target") {
    const run = workbench.agentRuns.find((item) => item.id === intent.runId);
    const target = run?.timeline.find((entry) => entry.id === intent.entryId)?.target;
    if (!target) {
      workbench.setNotice("The saved timeline target is no longer available in this workspace.");
      return;
    }
    if (target.view) {
      workbench.setActiveView(target.view);
    }
    if (target.evidenceId) {
      workbench.setSelectedId(target.evidenceId);
      workbench.setSelectedIds([target.evidenceId]);
      workbench.selectionAnchorRef.current = target.evidenceId;
    }
  }
}

export function useWorkspaceWindowBridge(
  workbench: RadarWorkbench,
  selectWebSocket: (id: string) => void
) {
  const workbenchRef = useRef(workbench);
  workbenchRef.current = workbench;
  const selectWebSocketRef = useRef(selectWebSocket);
  selectWebSocketRef.current = selectWebSocket;
  const revisionRef = useRef(0);

  const {
    activeView,
    selected,
    selectedFinding,
    selectedWorkflow,
    selectedAutomateResult
  } = workbench;
  const selection = useMemo(() => selectionFor({
    activeView,
    selected,
    selectedFinding,
    selectedWorkflow,
    selectedAutomateResult
  }), [
    activeView,
    selected,
    selectedFinding,
    selectedWorkflow,
    selectedAutomateResult
  ]);
  const pendingAttention = attentionCount(workbench);

  useEffect(() => {
    if (!window.radar) {
      return;
    }
    revisionRef.current += 1;
    const context: WorkspaceContextSnapshot = {
      revision: revisionRef.current,
      mode: workbench.appMode,
      activeView: workbench.activeView,
      project: workbench.localContext
        ? { id: workbench.localContext.profile.id, name: workbench.localContext.profile.name }
        : null,
      session: workbench.localContext
        ? { id: workbench.localContext.session.id, name: workbench.localContext.session.name }
        : null,
      browser: {
        open: workbench.browserState.open,
        url: workbench.browserState.url || workbench.address,
        title: workbench.browserState.title || ""
      },
      selection,
      executingRunId: workbench.executingAgentRun?.id || "",
      attentionCount: pendingAttention
    };
    void window.radar.publishWorkspaceContext(context);
  }, [
    workbench.appMode,
    workbench.activeView,
    workbench.localContext,
    workbench.browserState.open,
    workbench.browserState.url,
    workbench.browserState.title,
    workbench.address,
    workbench.executingAgentRun?.id,
    pendingAttention,
    selection
  ]);

  useEffect(() => window.radar?.onWorkspaceIntent((intent) => {
    applyWorkspaceIntent(intent, workbenchRef.current, selectWebSocketRef.current);
  }), []);
}
