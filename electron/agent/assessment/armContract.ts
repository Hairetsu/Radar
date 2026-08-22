import type { AgentCapabilityLeaseRequest } from "../../../shared/agent-types.js";
import { getProbeFamily, type AssessmentContract } from "../../../shared/agentAssessment.js";

export function assessmentLeaseFromContract(input: {
  contract: AssessmentContract;
  allowlist: string[];
  reason: string;
}): AgentCapabilityLeaseRequest {
  const grants = [];
  for (const origin of input.allowlist.slice(0, 8)) {
    for (const family of input.contract.families) {
      const definition = getProbeFamily(family);
      for (const method of definition.allowedMethods) {
        for (const pathPrefix of input.contract.includedPathPrefixes.slice(0, 2)) {
          grants.push({
            origin,
            method,
            pathPrefix,
            identity: input.contract.identity,
            probeFamily: family,
            ...(input.contract.evidenceSeedCaptureIds.length > 0
              ? { sourceCaptureIds: input.contract.evidenceSeedCaptureIds }
              : {}),
            endpointImpact: "read-only" as const
          });
        }
      }
    }
  }
  return {
    name: "Assessment contract",
    riskTier: "active",
    tools: ["runReplayExperiment", "sendReplay"],
    grants: grants.slice(0, 48),
    durationMs: input.contract.maxRuntimeMs,
    maxUses: 20,
    maxRequests: input.contract.maxProbeRequests,
    maxConcurrency: 1,
    maxPayloadBytes: input.contract.maxPayloadBytes,
    reason: input.reason
  };
}
