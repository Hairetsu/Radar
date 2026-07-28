import type { AgentToolResult } from "../../../shared/agent-types.js";
import { buildAdvancedTestingSummary } from "../../../shared/advancedTesting.js";
import { isAllowedTarget } from "../../../shared/allowlist.js";
import { normalizeAgentRunMemory } from "../../../shared/agentMemory.js";
import { normalizeWorkflowDefinition } from "../../../shared/workflows.js";
import { runtimeContextSummary, runCaptures } from "../evidenceContext.js";
import { createId, nowIso } from "../runtimeClock.js";
import type { AgentToolFamilyExecutor } from "./types.js";

export const executeProjectTool: AgentToolFamilyExecutor = async ({ run, counters, call, deps }) => {
  let result: AgentToolResult;
  switch (call.tool) {
        case "getWorkflowCatalog": {
          result = {
            tool: call.tool,
            ok: true,
            data: {
              workflows: deps.listWorkflows().map((workflow) => ({
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                mode: workflow.mode,
                inputs: workflow.inputs,
                scope: workflow.scope,
                steps: workflow.steps
              })),
              recentRuns: deps.listWorkflowRuns().slice(0, 8).map((run) => ({
                id: run.id,
                workflowId: run.workflowId,
                workflowName: run.workflowName,
                status: run.status,
                mode: run.mode,
                actionCount: run.actionCount,
                startedAt: run.startedAt,
                resultCount: run.results.length
              }))
            }
          };
          break;
        }
        case "getAgentContextSummary": {
          result = {
            tool: call.tool,
            ok: true,
            data: runtimeContextSummary({
              deps: deps,
              allowlist: deps.allowlist(),
              maxCaptureSample: run.policy.maxCaptureSample
            })
          };
          break;
        }
        case "getPluginInventory": {
          result = {
            tool: call.tool,
            ok: true,
            data: {
              plugins: deps.listPlugins().map((plugin) => ({
                id: plugin.id,
                name: plugin.manifest.name,
                version: plugin.manifest.version,
                status: plugin.status,
                requestedPermissions: plugin.manifest.permissions,
                grantedPermissions: plugin.grantedPermissions,
                panels: plugin.manifest.panels.map((panel) => ({
                  id: panel.id,
                  title: panel.title
                })),
                warningCount: plugin.warnings.length
              }))
            }
          };
          break;
        }
        case "getAdvancedTestingSummary": {
          const activeAllowlist = deps.allowlist();
          const captures = runCaptures(run, deps.getCaptures(), activeAllowlist, "");
          const frames = deps.getWebSocketEvents().filter((event) => isAllowedTarget(event.url, activeAllowlist));
          result = {
            tool: call.tool,
            ok: true,
            data: buildAdvancedTestingSummary(captures, frames)
          };
          break;
        }
        case "prepareWorkflowDraft": {
          const workflow = normalizeWorkflowDefinition(call.input.workflow);
          if (!workflow) {
            throw new Error("Prepared workflow definition was invalid.");
          }
          result = {
            tool: call.tool,
            ok: true,
            data: {
              workflow,
              note: call.input.note || "Prepared workflow draft for operator review."
            }
          };
          break;
        }
        case "runWorkflow": {
          const workflow = deps.listWorkflows().find((item) => item.id === call.input.workflowId);
          if (!workflow) {
            throw new Error("Workflow was not found.");
          }
          const requestedWorkflowBudget = workflow.mode === "active" ? workflow.scope.maxRequests : 0;
          if (counters.workflowRequestCount + requestedWorkflowBudget > run.policy.maxWorkflowRequests) {
            throw new Error("Workflow would exceed the AI-First workflow request budget.");
          }
          if (workflow.mode === "active" && counters.replayCount + workflow.scope.maxRequests > run.policy.maxReplay) {
            throw new Error("Workflow would exceed the AI-First replay budget.");
          }
          const workflowRun = await deps.runWorkflow({
            workflowId: call.input.workflowId,
            inputs: call.input.inputs,
            source: "ai"
          });
          counters.replayCount += workflowRun.actionCount;
          counters.workflowRequestCount += workflowRun.actionCount || requestedWorkflowBudget;
          result = {
            tool: call.tool,
            ok: true,
            data: workflowRun
          };
          break;
        }
        case "sendReplay": {
          counters.replayCount += 1;
          result = { tool: call.tool, ok: true, data: await deps.sendReplay(call.input.draft) };
          break;
        }
        case "proposeRunMemory": {
          const memory = normalizeAgentRunMemory(
            {
              ...call.input,
              id: createId("memory"),
              sourceRunId: run.id,
              status: "proposed",
              createdAt: nowIso(),
              updatedAt: nowIso()
            },
            createId("memory")
          );
          if (!memory) {
            throw new Error("Run memory proposal requires a title and notes.");
          }
          result = {
            tool: call.tool,
            ok: true,
            data: {
              memory,
              note: "Proposed run memory for operator confirmation."
            }
          };
          break;
        }
    default:
      return null;
  }
  return result;
};

