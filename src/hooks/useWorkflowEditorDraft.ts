import { useEffect, useState } from "react";
import {
  parseWorkflowDefinition
} from "../../shared/workflows.js";
import { workflowDefinitionText } from "../lib";
import type {
  CapturedRequest,
  WorkflowDefinition,
  WorkflowDryRun,
  WorkflowRun,
  WorkflowStepTemplate
} from "../types";

export function useWorkflowEditorDraft({
  selectedWorkflow,
  selectedCapture,
  aiPreparedWorkflowDraft,
  workflowStepTemplates,
  saveWorkflow,
  validateWorkflow,
  runWorkflow,
  workflowActionsRef
}: {
  selectedWorkflow: WorkflowDefinition | null;
  selectedCapture: CapturedRequest | null;
  aiPreparedWorkflowDraft: WorkflowDefinition | null;
  workflowStepTemplates: WorkflowStepTemplate[];
  saveWorkflow: (
    workflow: WorkflowDefinition
  ) => Promise<WorkflowDefinition | null>;
  validateWorkflow: (
    definition: string | WorkflowDefinition,
    inputs: Record<string, string>
  ) => Promise<WorkflowDryRun | null>;
  runWorkflow: (
    workflowId: string,
    inputs: Record<string, string>
  ) => Promise<WorkflowRun | null>;
  workflowActionsRef?: {
    current: { save: () => void; run: () => void } | null;
  };
}) {
  const [editorText, setEditorText] = useState("");
  const [editorError, setEditorError] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setEditorText(workflowDefinitionText(selectedWorkflow));
    setEditorError("");
    setInputs(
      Object.fromEntries(
        (selectedWorkflow?.inputs || []).map((input) => [
          input.id,
          input.type === "capture-id"
            ? selectedCapture?.id || input.defaultValue
            : input.defaultValue
        ])
      )
    );
  }, [selectedCapture?.id, selectedWorkflow]);

  useEffect(() => {
    if (!aiPreparedWorkflowDraft) {
      return;
    }
    setEditorText(
      workflowDefinitionText(aiPreparedWorkflowDraft)
    );
    setEditorError("");
    setInputs(
      Object.fromEntries(
        aiPreparedWorkflowDraft.inputs.map((input) => [
          input.id,
          input.type === "capture-id"
            ? selectedCapture?.id || input.defaultValue
            : input.defaultValue
        ])
      )
    );
  }, [aiPreparedWorkflowDraft, selectedCapture?.id]);

  const save = () => {
    const parsed = parseWorkflowDefinition(editorText);
    if (!parsed) {
      setEditorError(
        "Workflow definition is invalid or has no supported steps."
      );
      return;
    }
    setEditorError("");
    void saveWorkflow({
      ...parsed,
      builtIn: false,
      id: parsed.builtIn ? `${parsed.id}-custom` : parsed.id,
      updatedAt: new Date().toISOString()
    });
  };
  const validate = () => {
    void validateWorkflow(editorText, inputs);
  };
  const insertTemplate = (templateId: string) => {
    const template = workflowStepTemplates.find(
      (item) => item.id === templateId
    );
    const parsed =
      parseWorkflowDefinition(editorText) || selectedWorkflow;
    if (!template || !parsed) {
      setEditorError(
        "Select or draft a workflow before inserting a template."
      );
      return;
    }
    const activeTemplate =
      template.step.kind === "active-replay" ||
      template.step.kind === "browser-open";
    const nextWorkflow: WorkflowDefinition = {
      ...parsed,
      mode: activeTemplate ? "active" : parsed.mode,
      scope: activeTemplate
        ? {
            ...parsed.scope,
            allowActive: true,
            maxRequests: Math.max(parsed.scope.maxRequests, 1)
          }
        : parsed.scope,
      steps: [
        ...parsed.steps,
        {
          ...template.step,
          id: `${template.step.id}-${parsed.steps.length + 1}`
        }
      ],
      updatedAt: new Date().toISOString()
    };
    setEditorError("");
    setEditorText(workflowDefinitionText(nextWorkflow));
    void validateWorkflow(nextWorkflow, inputs);
  };
  const run = () => {
    if (selectedWorkflow) {
      void runWorkflow(selectedWorkflow.id, inputs);
    }
  };
  if (workflowActionsRef) {
    workflowActionsRef.current = { save, run };
  }

  return {
    workflowEditorText: editorText,
    setWorkflowEditorText: setEditorText,
    workflowEditorError: editorError,
    workflowInputs: inputs,
    setWorkflowInputs: setInputs,
    saveWorkflowEditor: save,
    validateWorkflowEditorDryRun: validate,
    insertWorkflowTemplate: insertTemplate,
    runSelectedWorkflow: run
  };
}
