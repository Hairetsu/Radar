import { useCallback, useEffect, useMemo, useState } from "react";
import {
  validateWorkflowDraft,
  workflowToGraph
} from "../../../shared/workflows.js";
import type {
  Finding,
  WorkflowDefinition,
  WorkflowDryRun,
  WorkflowRevision,
  WorkflowRun
} from "../../types";

import type { WorkView } from "./viewMeta";

export interface UseWorkflowsDomainArgs {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setFindings: (updater: (items: Finding[]) => Finding[]) => void;
  setSelectedFindingId: (id: string) => void;
}

export type WorkflowsDomain = ReturnType<typeof useWorkflowsDomain>;

export function useWorkflowsDomain({ setNotice, setActiveView, setFindings, setSelectedFindingId }: UseWorkflowsDomainArgs) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState("");
  const [workflowDryRun, setWorkflowDryRun] = useState<WorkflowDryRun>(() => validateWorkflowDraft(""));
  const [workflowRevisions, setWorkflowRevisions] = useState<WorkflowRevision[]>([]);
  const [aiPreparedWorkflowDraft, setAiPreparedWorkflowDraft] = useState<WorkflowDefinition | null>(null);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || workflows[0] || null,
    [selectedWorkflowId, workflows]
  );

  const selectedWorkflowGraph = useMemo(() => workflowToGraph(selectedWorkflow), [selectedWorkflow]);

  const selectedWorkflowRun = useMemo(
    () => workflowRuns.find((run) => run.id === selectedWorkflowRunId) || workflowRuns[0] || null,
    [selectedWorkflowRunId, workflowRuns]
  );

  const saveWorkflow = useCallback(async (workflow: WorkflowDefinition) => {
    if (!window.radar?.saveWorkflow) {
      setNotice("Run in Electron to save workflows.");
      return null;
    }
    try {
      const saved = await window.radar.saveWorkflow(workflow);
      setWorkflows((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedWorkflowId(saved.id);
      const revisions = await (window.radar.getWorkflowRevisions?.(saved.id) ?? Promise.resolve([]));
      setWorkflowRevisions(revisions);
      setNotice("Workflow saved");
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workflow save failed");
      return null;
    }
  }, [setNotice]);

  const validateWorkflowEditor = useCallback(async (definition: string | WorkflowDefinition, inputs: Record<string, string> = {}) => {
    try {
      const dryRun =
        (await (window.radar?.validateWorkflow?.({ definition, inputs }) ?? Promise.resolve(validateWorkflowDraft(definition, inputs))));
      setWorkflowDryRun(dryRun);
      setNotice(dryRun.ok ? `Workflow dry run: ${dryRun.runnableStepIds.length} runnable steps` : "Workflow dry run found errors");
      return dryRun;
    } catch (error) {
      const dryRun = validateWorkflowDraft(definition, inputs);
      setWorkflowDryRun(dryRun);
      setNotice(error instanceof Error ? error.message : "Workflow dry run failed");
      return dryRun;
    }
  }, [setNotice]);

  const refreshWorkflowRevisions = useCallback(async (workflowId = selectedWorkflow?.id || "") => {
    if (!workflowId || !window.radar?.getWorkflowRevisions) {
      setWorkflowRevisions([]);
      return [];
    }
    const revisions = await window.radar.getWorkflowRevisions(workflowId);
    setWorkflowRevisions(revisions);
    return revisions;
  }, [selectedWorkflow]);

  useEffect(() => {
    setWorkflowDryRun(selectedWorkflow ? validateWorkflowDraft(selectedWorkflow) : validateWorkflowDraft(""));
    void refreshWorkflowRevisions(selectedWorkflow?.id || "");
  }, [refreshWorkflowRevisions, selectedWorkflow]);

  const deleteWorkflow = useCallback(
    async (workflowId = selectedWorkflow?.id || "") => {
      if (!workflowId || !window.radar?.deleteWorkflow) {
        return null;
      }
      const result = await window.radar.deleteWorkflow(workflowId);
      setWorkflows(result.workflows);
      setSelectedWorkflowId((current) => (current === workflowId ? result.workflows[0]?.id || "" : current));
      setNotice(result.ok ? "Workflow deleted" : "Built-in workflows cannot be deleted");
      return result;
    },
    [selectedWorkflow, setNotice]
  );

  const runWorkflow = useCallback(
    async (workflowId = selectedWorkflow?.id || "", inputs: Record<string, string> = {}) => {
      if (!workflowId || !window.radar?.runWorkflow) {
        setNotice("Run in Electron to execute workflows.");
        return null;
      }
      const run = await window.radar.runWorkflow({ workflowId, inputs, source: "manual" });
      setWorkflowRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
      setSelectedWorkflowRunId(run.id);
      setActiveView("workflows");
      setNotice(run.status === "completed" ? `Workflow complete: ${run.results.length} results` : run.error || "Workflow failed");
      return run;
    },
    [selectedWorkflow, setNotice, setActiveView]
  );

  const promoteWorkflowResultToFinding = useCallback(async (runId: string, resultId: string) => {
    if (!window.radar?.promoteWorkflowResultToFinding) {
      setNotice("Run in Electron to promote workflow results.");
      return null;
    }
    try {
      const finding = await window.radar.promoteWorkflowResultToFinding({ runId, resultId });
      setFindings((items) => [finding, ...items.filter((item) => item.id !== finding.id)]);
      setSelectedFindingId(finding.id);
      setActiveView("findings");
      setNotice("Workflow result promoted to draft finding");
      return finding;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workflow finding promotion failed");
      return null;
    }
  }, [setNotice, setActiveView, setFindings, setSelectedFindingId]);

  return {
    workflows,
    setWorkflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedWorkflow,
    selectedWorkflowGraph,
    workflowDryRun,
    setWorkflowDryRun,
    workflowRevisions,
    setWorkflowRevisions,
    workflowRuns,
    setWorkflowRuns,
    selectedWorkflowRunId,
    setSelectedWorkflowRunId,
    selectedWorkflowRun,
    aiPreparedWorkflowDraft,
    setAiPreparedWorkflowDraft,
    saveWorkflow,
    validateWorkflowEditor,
    refreshWorkflowRevisions,
    deleteWorkflow,
    runWorkflow,
    promoteWorkflowResultToFinding
  };
}
