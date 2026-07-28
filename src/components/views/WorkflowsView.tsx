import {
  Activity,
  FilePlus2,
  FileText,
  Play,
  ShieldCheck,
  Trash2
} from "lucide-react";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { WorkflowsDomain } from "../../hooks/workbench/useWorkflowsDomain";
import { useWorkflowEditorDraft } from "../../hooks/useWorkflowEditorDraft";
import {
  cn,
  diffTone,
  validationTone,
  workflowResultTone
} from "../../lib";
import type { WorkflowStepTemplate } from "../../types";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export type WorkflowsViewProps = Pick<
  WorkflowsDomain,
  | "workflows"
  | "workflowRuns"
  | "selectedWorkflow"
  | "setSelectedWorkflowId"
  | "deleteWorkflow"
  | "aiPreparedWorkflowDraft"
  | "selectedWorkflowGraph"
  | "workflowDryRun"
  | "workflowRevisions"
  | "selectedWorkflowRun"
  | "setSelectedWorkflowRunId"
  | "promoteWorkflowResultToFinding"
  | "saveWorkflow"
  | "validateWorkflowEditor"
  | "runWorkflow"
> & {
  workflowStepTemplates: WorkflowStepTemplate[];
  selected: TrafficDomain["selected"];
  workflowActionsRef?: { current: { save: () => void; run: () => void } | null };
};

export function WorkflowsView({
  workflows,
  workflowRuns,
  selectedWorkflow,
  setSelectedWorkflowId,
  deleteWorkflow,
  aiPreparedWorkflowDraft,
  selectedWorkflowGraph,
  workflowDryRun,
  workflowStepTemplates,
  workflowRevisions,
  selectedWorkflowRun,
  setSelectedWorkflowRunId,
  promoteWorkflowResultToFinding,
  saveWorkflow,
  validateWorkflowEditor,
  runWorkflow,
  selected: selectedCapture,
  workflowActionsRef
}: WorkflowsViewProps) {
  const {
    workflowEditorText,
    setWorkflowEditorText,
    workflowEditorError,
    workflowInputs,
    setWorkflowInputs,
    saveWorkflowEditor,
    validateWorkflowEditorDryRun,
    insertWorkflowTemplate,
    runSelectedWorkflow
  } = useWorkflowEditorDraft({
    selectedWorkflow,
    selectedCapture,
    aiPreparedWorkflowDraft,
    workflowStepTemplates,
    saveWorkflow,
    validateWorkflow: validateWorkflowEditor,
    runWorkflow,
    workflowActionsRef
  });

  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(300px,0.34fr)_minmax(420px,0.74fr)_minmax(320px,0.42fr)] max-[1320px]:grid-cols-[minmax(300px,0.42fr)_minmax(460px,1fr)] max-[900px]:grid-cols-1">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)_auto] max-[900px]:border-r-0 max-[900px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(4,minmax(0,1fr))]">
          {[
            ["Catalog", workflows.length],
            ["Runs", workflowRuns.length],
            ["Fail", workflowRuns.reduce((total, run) => total + run.results.filter((item) => item.level === "fail").length, 0)],
            ["Warn", workflowRuns.reduce((total, run) => total + run.results.filter((item) => item.level === "warn").length, 0)]
          ].map(([label, value]) => (
            <div key={label} className="radar-card-gradient px-4 py-3">
              <span className="block rd-eyebrow text-muted">
                {label}
              </span>
              <strong className="mt-1 block font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="min-h-0 overflow-auto radar-traffic-list" data-testid="workflowCatalog">
          {workflows.length === 0 && <EmptyState>No workflows saved</EmptyState>}
          {workflows.map((workflow) => (
            <Button
              key={workflow.id}
              variant="ghost"
              className={cn(
                "relative grid h-auto w-full justify-stretch gap-2 rounded-none border-0 border-b border-rule bg-transparent px-4 py-3 text-left normal-case transition hover:bg-signal/[0.06]",
                selectedWorkflow?.id === workflow.id && "bg-signal/[0.09]"
              )}
              onClick={() => setSelectedWorkflowId(workflow.id)}
              data-testid={`workflowRow-${workflow.id}`}
              data-component="workflowRow"
            >
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge tone={workflow.mode === "active" ? "warn" : "good"}>{workflow.mode}</StatusBadge>
                {workflow.builtIn && <StatusBadge>built-in</StatusBadge>}
                <span className="ml-auto rd-label text-muted">
                  {workflow.steps.length} steps
                </span>
              </div>
              <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
                {workflow.name}
              </strong>
              <span className="line-clamp-2 text-meta leading-5 text-muted">{workflow.description}</span>
            </Button>
          ))}
        </div>

        <div className="grid gap-2 border-t border-rule p-3">
          <Button
            variant="ghost"
            type="button"
            onClick={() => void deleteWorkflow()}
            disabled={!selectedWorkflow || selectedWorkflow.builtIn}
            data-testid="deleteWorkflow"
          >
            <Trash2 size={13} strokeWidth={1.7} />
            Delete Saved Workflow
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)_auto] max-[1320px]:border-r-0">
        <div className="border-b border-rule p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="block rd-eyebrow text-signal">
                Declarative workflow
              </span>
              <h2 className="mt-1 font-display text-hero uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                {selectedWorkflow?.name || "Workflow"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={selectedWorkflow?.mode === "active" ? "warn" : "good"}>
                {selectedWorkflow?.mode || "passive"}
              </StatusBadge>
              <StatusBadge>
                cap {selectedWorkflow?.scope.maxRequests || 0} req
              </StatusBadge>
              <StatusBadge>{selectedWorkflow?.scope.timeoutMs || 0}ms</StatusBadge>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto p-4">
          <div className="grid gap-4">
            {aiPreparedWorkflowDraft && (
              <div className="border border-signal/35 bg-signal/[0.06] p-3" data-testid="aiPreparedWorkflowDraft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <FieldLabel>AI-Prepared Draft</FieldLabel>
                    <p className="mt-1 text-body leading-5 text-muted">
                      Loaded into the editor for review. Save and Run stay manual operator actions.
                    </p>
                  </div>
                  <StatusBadge>{aiPreparedWorkflowDraft.mode}</StatusBadge>
                </div>
              </div>
            )}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid gap-3 border border-rule bg-ink/25 p-3" data-testid="workflowGraph">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>Visual Graph</FieldLabel>
                  <StatusBadge tone={workflowDryRun.ok ? "good" : "danger"}>
                    {workflowDryRun.ok ? "dry-run clean" : "needs review"}
                  </StatusBadge>
                </div>
                <div className="grid gap-2">
                  {selectedWorkflowGraph.nodes.length === 0 && <EmptyState>No workflow graph available</EmptyState>}
                  {selectedWorkflowGraph.nodes.map((node, index) => (
                    <div key={node.id} className="grid gap-2 border border-rule bg-surface/40 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={node.active ? "warn" : "good"}>{node.active ? "active" : "passive"}</StatusBadge>
                        <span className="rd-label text-muted">
                          {String(index + 1).padStart(2, "0")} / {node.kind}
                        </span>
                        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
                          {node.title}
                        </strong>
                      </div>
                      {node.condition && (
                        <span className="font-mono text-label text-sand">
                          branch if {node.condition.inputId} = {node.condition.equals}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {selectedWorkflowGraph.edges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedWorkflowGraph.edges.map((edge) => (
                      <StatusBadge key={`${edge.from}-${edge.to}`} tone="ghost">
                        {`${edge.from} -> ${edge.to}: ${edge.label}`}
                      </StatusBadge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 border border-rule bg-ink/25 p-3" data-testid="workflowStepTemplates">
                <FieldLabel>Step Templates</FieldLabel>
                <div className="grid gap-2">
                  {workflowStepTemplates.map((template) => (
                    <Button
                      key={template.id}
                      variant="ghost"
                      type="button"
                      className="h-auto justify-start gap-2 border border-rule bg-surface/40 px-2 py-2 text-left normal-case"
                      onClick={() => insertWorkflowTemplate(template.id)}
                      data-testid={`workflowTemplate-${template.id}`}
                    >
                      <FilePlus2 size={13} strokeWidth={1.7} />
                      <span className="min-w-0">
                        <span className="block font-display text-body uppercase tracking-data text-bone">
                          {template.title}
                        </span>
                        <span className="line-clamp-2 text-label leading-4 text-muted">{template.description}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-2 border border-rule bg-ink/25 p-3" data-testid="workflowDryRun">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>Dry-Run Validation</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone="good">{workflowDryRun.passiveStepCount} passive</StatusBadge>
                  <StatusBadge tone={workflowDryRun.activeStepCount > 0 ? "warn" : "ghost"}>
                    {workflowDryRun.estimatedRequests} active req
                  </StatusBadge>
                  <StatusBadge>{workflowDryRun.runnableStepIds.length} runnable</StatusBadge>
                </div>
              </div>
              {workflowDryRun.issues.length === 0 ? (
                <span className="rd-label text-muted">
                  No dry-run issues for the current draft.
                </span>
              ) : (
                <div className="grid gap-1">
                  {workflowDryRun.issues.map((issue) => (
                    <StatusBadge key={`${issue.severity}-${issue.message}`} tone={validationTone(issue.severity)}>
                      {issue.severity}: {issue.message}
                    </StatusBadge>
                  ))}
                </div>
              )}
              {workflowDryRun.skippedStepIds.length > 0 && (
                <span className="font-mono text-label text-sand">
                  Skipped by branch conditions: {workflowDryRun.skippedStepIds.join(", ")}
                </span>
              )}
            </div>
            {selectedWorkflow && selectedWorkflow.inputs.length > 0 && (
              <div className="grid gap-3 border border-rule bg-ink/25 p-3">
                <FieldLabel>Inputs</FieldLabel>
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedWorkflow.inputs.map((input) => (
                    <label key={input.id} className="grid gap-1">
                      <span className="rd-eyebrow text-muted">
                        {input.label}
                      </span>
                      <Input
                        value={workflowInputs[input.id] || ""}
                        onChange={(event) =>
                          setWorkflowInputs((current) => ({ ...current, [input.id]: event.target.value }))
                        }
                        placeholder={input.type === "capture-id" ? selectedCapture?.id || "select capture" : input.defaultValue}
                        data-testid={`workflowInput-${input.id}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="workflowDefinition">Definition</FieldLabel>
                {workflowEditorError && (
                  <span className="rd-label text-rust">
                    {workflowEditorError}
                  </span>
                )}
              </div>
              <Textarea
                id="workflowDefinition"
                variant="code"
                className="min-h-[390px]"
                value={workflowEditorText}
                onChange={(event) => setWorkflowEditorText(event.target.value)}
                data-testid="workflowDefinition"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2 border-t border-rule p-3 md:grid-cols-4">
          <Button variant="outline" type="button" onClick={saveWorkflowEditor} data-testid="saveWorkflow">
            <FilePlus2 size={13} strokeWidth={1.7} />
            Save
          </Button>
          <Button variant="outline" type="button" onClick={validateWorkflowEditorDryRun} data-testid="validateWorkflow">
            <ShieldCheck size={13} strokeWidth={1.7} />
            Dry Run
          </Button>
          <Button
            variant="solid"
            type="button"
            onClick={runSelectedWorkflow}
            disabled={!selectedWorkflow}
            data-testid="runWorkflow"
          >
            <Play size={13} strokeWidth={1.7} />
            Run
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setWorkflowInputs((current) => ({
                ...current,
                "capture-id": selectedCapture?.id || current["capture-id"] || ""
              }));
            }}
            disabled={!selectedCapture}
            data-testid="workflowUseSelectedCapture"
          >
            <Activity size={13} strokeWidth={1.7} />
            Use Capture
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 [grid-template-rows:minmax(180px,0.3fr)_minmax(160px,0.26fr)_minmax(0,1fr)] max-[1320px]:col-span-2 max-[900px]:col-span-1">
        <div className="min-h-0 overflow-auto border-b border-rule radar-traffic-list" data-testid="workflowRunHistory">
          {workflowRuns.length === 0 && <EmptyState>No workflow runs yet</EmptyState>}
          {workflowRuns.map((run) => (
            <Button
              key={run.id}
              variant="ghost"
              className={cn(
                "grid h-auto w-full justify-stretch gap-2 rounded-none border-0 border-b border-rule px-4 py-3 text-left normal-case",
                selectedWorkflowRun?.id === run.id && "bg-signal/[0.09]"
              )}
              onClick={() => setSelectedWorkflowRunId(run.id)}
              data-testid={`workflowRun-${run.id}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge tone={run.status === "completed" ? "good" : "danger"}>{run.status}</StatusBadge>
                <StatusBadge tone={run.mode === "active" ? "warn" : "ghost"}>{run.mode}</StatusBadge>
                <span className="ml-auto rd-label text-muted">
                  {run.results.length} results
                </span>
              </div>
              <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
                {run.workflowName}
              </strong>
              <span className="font-mono text-label text-muted">{run.startedAt}</span>
            </Button>
          ))}
        </div>

        <div className="min-h-0 overflow-auto border-b border-rule p-4" data-testid="workflowRevisions">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="rd-eyebrow text-signal">
                Version history
              </span>
              <h2 className="mt-1 font-display text-title uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                Definition Diffs
              </h2>
            </div>
            <StatusBadge>{workflowRevisions.length} saved</StatusBadge>
          </div>
          {workflowRevisions.length === 0 && <EmptyState>No saved revisions yet</EmptyState>}
          <div className="grid gap-2">
            {workflowRevisions.slice(0, 4).map((revision) => (
              <div key={revision.id} className="grid gap-2 border border-rule bg-ink/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-display text-lead uppercase tracking-data text-bone">
                    {revision.summary}
                  </strong>
                  <span className="font-mono text-micro text-muted">{revision.savedAt}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {revision.diff.slice(0, 5).map((diff) => (
                    <StatusBadge key={`${revision.id}-${diff.kind}-${diff.field}`} tone={diffTone(diff.kind)}>
                      {diff.kind} {diff.field}
                    </StatusBadge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-auto p-4" data-testid="workflowResults">
          {!selectedWorkflowRun && <EmptyState>Select a workflow run to inspect results.</EmptyState>}
          {selectedWorkflowRun && (
            <div className="grid gap-3">
              {selectedWorkflowRun.error && (
                <div className="border border-rust/40 bg-rust/10 p-3 font-mono text-meta text-rust">
                  {selectedWorkflowRun.error}
                </div>
              )}
              {selectedWorkflowRun.results.map((result) => (
                <div key={result.id} className="grid gap-3 border border-rule bg-ink/25 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <StatusBadge tone={workflowResultTone(result.level)}>{result.level}</StatusBadge>
                      <h3 className="mt-2 font-display text-title uppercase tracking-data text-bone">
                        {result.title}
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      size="compact"
                      type="button"
                      onClick={() =>
                        void promoteWorkflowResultToFinding(selectedWorkflowRun?.id || "", result.id)
                      }
                      disabled={result.level !== "fail" && result.level !== "warn"}
                      data-testid={`promoteWorkflowResult-${result.id}`}
                    >
                      <FileText size={12} strokeWidth={1.7} />
                      Finding
                    </Button>
                  </div>
                  <p className="text-body leading-6 text-copy">{result.message}</p>
                  <pre className="max-h-[150px] overflow-auto text-meta">
                    {[
                      ...result.evidence.map((ref) => `${ref.kind}:${ref.id} ${ref.label}`),
                      ...Object.entries(result.details).map(([key, value]) => `${key}: ${value}`)
                    ].join("\n") || "No details"}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
