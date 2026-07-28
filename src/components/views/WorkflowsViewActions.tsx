import { FilePlus2, Play } from "lucide-react";
import type { WorkflowsDomain } from "../../hooks/workbench/useWorkflowsDomain";
import { Button } from "../ui/button";

export type WorkflowsViewActionsProps = Pick<WorkflowsDomain, "selectedWorkflow"> & {
  onSaveWorkflow: () => void;
  onRunWorkflow: () => void;
};

export function WorkflowsViewActions({
  selectedWorkflow,
  onSaveWorkflow,
  onRunWorkflow
}: WorkflowsViewActionsProps) {
  return (
    <>
      <Button
        variant="outline"
        type="button"
        onClick={onSaveWorkflow}
        data-testid="saveWorkflowHeader"
      >
        <FilePlus2 size={14} strokeWidth={1.7} />
        Save Workflow
      </Button>
      <Button
        variant="solid"
        type="button"
        onClick={onRunWorkflow}
        disabled={!selectedWorkflow}
        data-testid="runWorkflowHeader"
      >
        <Play size={14} strokeWidth={1.7} />
        Run Workflow
      </Button>
    </>
  );
}
