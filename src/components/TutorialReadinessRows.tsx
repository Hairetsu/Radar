import type { AgentTutorialGuidance } from "../types";

export type TutorialReadinessRowsProps = {
  guidance: AgentTutorialGuidance;
};

export function TutorialReadinessRows({
  guidance
}: TutorialReadinessRowsProps) {
  if (!guidance.cveReadiness) {
    return null;
  }
  return [
    ["Product", guidance.cveReadiness.product],
    ["Versions", guidance.cveReadiness.affectedVersions.join(", ")],
    ["Impact", guidance.cveReadiness.securityImpact],
    ["Reach", guidance.cveReadiness.deploymentScope],
    ["Repeat", guidance.cveReadiness.reproducibility]
  ].map(([label, value]) => (
    <div
      key={label}
      className="grid gap-1 border-t border-rule/70 py-2 sm:grid-cols-[72px_1fr]"
    >
      <span className="rd-label text-muted">{label}</span>
      <span className="text-meta leading-5 text-copy">{value}</span>
    </div>
  ));
}
