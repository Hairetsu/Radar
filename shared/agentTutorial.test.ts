import { describe, expect, it } from "vitest";
import { fallbackAgentTutorialGuidance, normalizeAgentTutorialGuidance } from "./agentTutorial.js";

describe("agentTutorial", () => {
  it("normalizes evidence-led guidance and keeps a complete CVE review candidate", () => {
    expect(
      normalizeAgentTutorialGuidance({
        stage: "triage",
        title: "Authorization bypass crosses installations",
        clue: "A low-privilege identity can read another tenant's invoice.",
        whyItMatters: "The server returns protected data without enforcing object ownership.",
        lookFor: ["A 200 response under the challenger identity"],
        strongerEvidence: ["A second clean installation with the same affected version"],
        falsifiers: ["The object is intentionally public"],
        safeNextStep: "Preserve the minimal reproduction and contact the vendor privately.",
        disposition: "cve-review",
        dispositionRationale: "The behavior appears product-level and repeatable.",
        evidenceRefs: ["capture:invoice-a", "capture:invoice-b"],
        cveReadiness: {
          product: "Example Server",
          affectedVersions: ["4.2.0"],
          securityImpact: "Cross-tenant invoice disclosure",
          deploymentScope: "Default authorization handler used across installations",
          reproducibility: "Repeated with two identities on a clean 4.2.0 install"
        }
      })
    ).toMatchObject({ disposition: "cve-review", evidenceRefs: ["capture:invoice-a", "capture:invoice-b"] });
  });

  it("downgrades unsupported CVE language to private vendor review", () => {
    expect(
      normalizeAgentTutorialGuidance({
        title: "Maybe a CVE",
        disposition: "cve-review",
        evidenceRefs: [],
        cveReadiness: { product: "Example" }
      })
    ).toMatchObject({ disposition: "vendor-report", stage: "observe" });
  });

  it("builds a safe fallback when a tutorial planner omits guidance", () => {
    expect(
      fallbackAgentTutorialGuidance({
        action: "tool",
        call: { tool: "getDomSummary", input: {} },
        rationale: "Map the visible controls."
      })
    ).toMatchObject({ title: "Observe getDomSummary", disposition: "learning-clue" });
  });
});
