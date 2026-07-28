import type {
  PluginInstallStatus,
  WorkflowDefinition,
  WorkflowResultLevel
} from "../../types";
import type { StatusTone } from "./statusTone";

export function workflowResultTone(
  level: WorkflowResultLevel
): StatusTone {
  if (level === "pass") {
    return "good";
  }
  if (level === "fail") {
    return "danger";
  }
  if (level === "warn") {
    return "warn";
  }
  return "ghost";
}

export function pluginStatusTone(
  status: PluginInstallStatus
): StatusTone {
  if (status === "approved") {
    return "good";
  }
  if (status === "pending") {
    return "warn";
  }
  if (status === "blocked") {
    return "danger";
  }
  return "ghost";
}

export function pluginTrustTone(trust: string): StatusTone {
  if (trust === "first-party") {
    return "good";
  }
  if (trust === "verified-local") {
    return "move";
  }
  if (trust === "untrusted") {
    return "danger";
  }
  return "ghost";
}

export function validationTone(severity: string): StatusTone {
  return severity === "error" ? "danger" : "warn";
}

export function diffTone(kind: string): StatusTone {
  if (kind === "added") {
    return "good";
  }
  if (kind === "removed") {
    return "danger";
  }
  return "move";
}

export function advancedSignalTone(severity: string): StatusTone {
  if (severity === "high") {
    return "danger";
  }
  if (severity === "medium") {
    return "warn";
  }
  if (severity === "low") {
    return "move";
  }
  return "ghost";
}

export function workflowDefinitionText(
  workflow: WorkflowDefinition | null
) {
  if (!workflow) {
    return "";
  }
  return JSON.stringify(
    {
      id: workflow.builtIn
        ? `${workflow.id}-custom`
        : workflow.id,
      name: workflow.name,
      description: workflow.description,
      mode: workflow.mode,
      scope: workflow.scope,
      inputs: workflow.inputs,
      steps: workflow.steps
    },
    null,
    2
  );
}
