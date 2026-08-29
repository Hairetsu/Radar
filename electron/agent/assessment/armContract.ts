import type { AgentCapabilityLeaseRequest } from "../../../shared/agent-types.js";
import { getProbeFamily, type AssessmentContract } from "../../../shared/agentAssessment.js";

export function assessmentLeaseFromContract(input: {
  contract: AssessmentContract;
  allowlist: string[];
  origins?: string[];
  reason: string;
}): AgentCapabilityLeaseRequest {
  const origins = [...new Set((input.origins || input.allowlist).flatMap((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? [parsed.origin] : [];
    } catch {
      return [];
    }
  }))].slice(0, 2);
  const grants = [];
  for (const origin of origins) {
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
    tools: ["runReplayExperiment"],
    grants: grants.slice(0, 48),
    durationMs: input.contract.maxRuntimeMs,
    maxUses: 20,
    maxRequests: input.contract.maxProbeRequests,
    maxConcurrency: 1,
    maxPayloadBytes: input.contract.maxPayloadBytes,
    reason: input.reason
  };
}
