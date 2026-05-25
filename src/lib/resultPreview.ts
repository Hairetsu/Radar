import type { AiRunResult } from "../ai/types";

export function resultPreview(result: AiRunResult) {
  if (!result.ok || !result.output) {
    return result.error || "AI request failed.";
  }

  const { output } = result;
  switch (output.task) {
    case "capture_summary":
      return [
        output.data.summary,
        "",
        "Observations:",
        ...output.data.observations.map((line) => `- ${line}`),
        "",
        "Uncertainties:",
        ...output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "repeater_drafts":
      return output.data.drafts
        .map(
          (draft, index) =>
            `${index + 1}. ${draft.label}\n${draft.rationale}\n${draft.draft.method} ${draft.draft.url}`
        )
        .join("\n\n");
    case "scope_checklist":
      return output.data.items
        .map((item) => `${item.title}\n${item.steps.map((step) => `  - ${step}`).join("\n")}`)
        .join("\n\n");
    case "report_notes":
      return [
        output.data.notes,
        "",
        "Evidence:",
        ...output.data.evidenceRefs.map((ref) => `- ${ref}`),
        "",
        "Uncertainties:",
        ...output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "browser_helper":
      return output.data.steps
        .map((step, index) => `${index + 1}. [${step.action}] ${step.label}${step.url ? ` → ${step.url}` : ""}`)
        .join("\n");
    default:
      return result.rawText || "";
  }
}
