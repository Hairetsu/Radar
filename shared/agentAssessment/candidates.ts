import type { CapturedRequest } from "../domain.js";
import { originFromUrl } from "../url.js";
import { contractAllowsFamily, contractAllowsPath } from "./contract.js";
import { familyAllowsMethod } from "./families.js";
import { classifyEndpointImpact, impactAllowsReadOnlyProbes } from "./impact.js";
import type { AssessmentCandidate, AssessmentContract, ProbeFamilyId } from "./types.js";

function parameterNames(capture: CapturedRequest) {
  const names = new Set<string>();
  try {
    const url = new URL(capture.url);
    for (const key of url.searchParams.keys()) {
      names.add(key);
    }
  } catch {
    // Invalid URLs contribute no query names.
  }
  const contentType = Object.entries(capture.requestHeaders).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(capture.requestBody || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed as Record<string, unknown>)) {
          names.add(key);
        }
      }
    } catch {
      // Ignore malformed JSON bodies.
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    for (const key of new URLSearchParams(capture.requestBody).keys()) {
      names.add(key);
    }
  }
  return [...names].slice(0, 12);
}

function hasAuthorizationMaterial(capture: CapturedRequest) {
  return Object.keys(capture.requestHeaders).some((name) =>
    ["authorization", "cookie", "x-api-key", "x-auth-token"].includes(name.toLowerCase())
  );
}

function hasResourceIdentifier(capture: CapturedRequest, parameters: string[]) {
  if (parameters.some((name) => /(id|account|invoice|resource|shipment|tenant|user)/i.test(name))) {
    return true;
  }
  return capture.path
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .some((segment) => /^\d+$/.test(segment) || /^[a-z]+-\d+$/i.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment));
}

function applicableFamilies(
  contract: AssessmentContract,
  capture: CapturedRequest,
  parameters: string[]
): ProbeFamilyId[] {
  const method = capture.method.toUpperCase();
  const impact = classifyEndpointImpact({ method, path: capture.path });
  if (!impactAllowsReadOnlyProbes(impact)) {
    return [];
  }
  return contract.families.filter((family) => {
    if (!contractAllowsFamily(contract, family) || !familyAllowsMethod(family, method)) {
      return false;
    }
    switch (family) {
      case "cors-origin":
        return true;
      case "reflection-context":
      case "injection-signal":
        return parameters.length > 0;
      case "authorization-omission":
        return hasAuthorizationMaterial(capture);
      case "resource-id":
        return hasResourceIdentifier(capture, parameters);
      default: {
        const _exhaustive: never = family;
        return _exhaustive;
      }
    }
  });
}

export function rankAssessmentCandidates(input: {
  captures: CapturedRequest[];
  contract: AssessmentContract;
  covered: Array<{ captureId: string; family: ProbeFamilyId }>;
}): AssessmentCandidate[] {
  const coverage = new Map<string, ProbeFamilyId[]>();
  for (const item of input.covered) {
    coverage.set(item.captureId, [...(coverage.get(item.captureId) || []), item.family]);
  }
  const candidates: AssessmentCandidate[] = [];
  for (const capture of input.captures) {
    if (!capture.allowed) {
      continue;
    }
    const origin = originFromUrl(capture.url);
    if (!origin) {
      continue;
    }
    if (input.contract.evidenceSeedCaptureIds.length > 0 && !input.contract.evidenceSeedCaptureIds.includes(capture.id)) {
      continue;
    }
    if (!contractAllowsPath(input.contract, capture.path)) {
      continue;
    }
    const params = parameterNames(capture);
    const families = applicableFamilies(input.contract, capture, params);
    if (families.length === 0) {
      continue;
    }
    const priorCoverage = coverage.get(capture.id) || [];
    const uncovered = families.filter((family) => !priorCoverage.includes(family)).length;
    candidates.push({
      captureId: capture.id,
      origin,
      method: capture.method.toUpperCase(),
      path: capture.path,
      endpointImpact: classifyEndpointImpact({ method: capture.method, path: capture.path }),
      identity: capture.identityId || input.contract.identity,
      parameterNames: params,
      applicableFamilies: families,
      priorCoverage,
      rank: uncovered * 10 + params.length - priorCoverage.length
    });
  }
  return candidates.sort((left, right) => right.rank - left.rank || left.path.localeCompare(right.path)).slice(0, 40);
}
