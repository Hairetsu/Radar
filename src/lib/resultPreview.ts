import type { AiRunResult } from "../ai/types";

export function resultPreview(result: AiRunResult) {
  if (!result.ok || !result.output) {
    return result.error || "AI request failed.";
  }

  switch (result.output.task) {
    case "capture_summary":
      return [
        result.output.data.summary,
        "",
        "Observations:",
        ...result.output.data.observations.map((line) => `- ${line}`),
        "",
        "Uncertainties:",
        ...result.output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "repeater_drafts":
      return result.output.data.drafts
        .map(
          (draft, index) =>
            `${index + 1}. ${draft.label}\n${draft.rationale}\n${draft.draft.method} ${draft.draft.url}`
        )
        .join("\n\n");
    case "scope_checklist":
      return result.output.data.items
        .map((item) => `${item.title}\n${item.steps.map((step) => `  - ${step}`).join("\n")}`)
        .join("\n\n");
    case "report_notes":
      return [
        result.output.data.notes,
        "",
        "Evidence:",
        ...result.output.data.evidenceRefs.map((ref) => `- ${ref}`),
        "",
        "Uncertainties:",
        ...result.output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "browser_helper":
      return result.output.data.steps
        .map((step, index) => `${index + 1}. [${step.action}] ${step.label}${step.url ? ` → ${step.url}` : ""}`)
        .join("\n");
    case "tls_review":
      return [
        result.output.data.summary,
        "",
        "Findings:",
        ...result.output.data.findings.map((line) => `- ${line}`),
        "",
        "Recommendations:",
        ...result.output.data.recommendations.map((line) => `- ${line}`)
      ].join("\n");
    case "custom":
      return result.output.data.text;
    default:
      return result.rawText || "";
  }
}
