import type { CapturedRequest } from "../shared/domain.js";

export type CaptureAttributionContext = {
  agentRunId?: string;
  navigationId?: string;
  actionId?: string;
  identityId?: string;
  activationId?: string;
  sequenceRunId?: string;
  experimentId?: string;
};

const ATTRIBUTION_KEYS = [
  "agentRunId",
  "navigationId",
  "actionId",
  "identityId",
  "activationId",
  "sequenceRunId",
  "experimentId"
] as const;

export function applyCaptureAttribution(
  entry: CapturedRequest,
  existing: CapturedRequest | undefined,
  context: CaptureAttributionContext
) {
  const next = { ...entry };
  for (const key of ATTRIBUTION_KEYS) {
    const value = next[key] || existing?.[key] || context[key];
    if (value) {
      next[key] = value;
    }
  }
  return next;
}
