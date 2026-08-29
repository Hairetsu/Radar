import type { ReplayDiffSummary } from "../replayDiff.js";
import { UNTRUSTED_CORS_ORIGIN } from "./constants.js";
import type { ExperimentClassification, ProbeFamilyId, ReplayExperimentResult } from "./types.js";

function headerValue(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === lower);
  return key ? headers[key] : "";
}

function bodyContains(body: string, needle: string) {
  return Boolean(needle) && body.includes(needle);
}

function jsonValueShape(value: unknown, depth = 0): unknown {
  if (depth >= 6) return "nested";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const itemShapes = [...new Set(value.slice(0, 8).map((item) => JSON.stringify(jsonValueShape(item, depth + 1))))];
    return { array: itemShapes.map((item) => JSON.parse(item) as unknown) };
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, jsonValueShape(item, depth + 1)])
    );
  }
  return typeof value;
}

function responseBodyShape(body: string) {
  try {
    return `json:${JSON.stringify(jsonValueShape(JSON.parse(body) as unknown))}`;
  } catch {
    return `text:${body
      .replace(/[\p{L}\p{N}]+/gu, "value")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400)}`;
  }
}

export function classifyReplayExperiment(input: {
  family: ProbeFamilyId;
  baselineStatus: number;
  baselineBody: string;
  variants: Array<{
    payload: string;
    status: number;
    body: string;
    headers: Record<string, string>;
    comparison: ReplayDiffSummary;
  }>;
}): { classification: ExperimentClassification; rationale: string } {
  if (input.variants.length === 0) {
    return { classification: "inconclusive", rationale: "No variants were sent." };
  }

  switch (input.family) {
    case "cors-origin": {
      const untrusted = input.variants.find((variant) => variant.payload === UNTRUSTED_CORS_ORIGIN);
      if (!untrusted) {
        return { classification: "inconclusive", rationale: "The untrusted Origin variant was not sent." };
      }
      const allowOrigin = headerValue(untrusted.headers, "access-control-allow-origin");
      const allowCredentials = headerValue(untrusted.headers, "access-control-allow-credentials").toLowerCase() === "true";
      if (allowOrigin === UNTRUSTED_CORS_ORIGIN && allowCredentials) {
        return {
          classification: "verification-required",
          rationale: "Untrusted Origin was reflected with credentials. Confirm with an OPTIONS comparison before promoting a finding."
        };
      }
      if (allowOrigin === UNTRUSTED_CORS_ORIGIN) {
        return {
          classification: "supported",
          rationale: "Untrusted Origin was reflected. This is a CORS lead, not a confirmed credentialed issue."
        };
      }
      if (input.variants.every((variant) => variant.comparison.identical || variant.status === input.baselineStatus)) {
        return { classification: "negative", rationale: "Origin changes did not alter CORS headers." };
      }
      return { classification: "inconclusive", rationale: "CORS headers changed without a clear untrusted reflection." };
    }
    case "reflection-context": {
      const reflected = input.variants.filter((variant) =>
        bodyContains(variant.body, variant.payload) ||
        Object.values(variant.headers).some((value) => value.includes(variant.payload))
      );
      if (reflected.length === 0) {
        return { classification: "negative", rationale: "The canary was not reflected in bodies or headers." };
      }
      return {
        classification: "supported",
        rationale: "The inert canary was reflected. This is a reflection candidate, not executable XSS."
      };
    }
    case "injection-signal": {
      const syntax = input.variants.find((variant) => variant.payload === "'");
      const booleanVariant = input.variants.find((variant) => variant.payload.includes("OR"));
      if (!syntax || !booleanVariant) {
        return { classification: "inconclusive", rationale: "Injection families require a syntax-error and Boolean pair." };
      }
      const syntaxChanged =
        syntax.status !== input.baselineStatus ||
        responseBodyShape(syntax.body) !== responseBodyShape(input.baselineBody);
      const booleanChanged =
        booleanVariant.status !== syntax.status ||
        responseBodyShape(booleanVariant.body) !== responseBodyShape(syntax.body);
      if (syntaxChanged && booleanChanged) {
        return {
          classification: "verification-required",
          rationale: "Syntax-error and Boolean variants diverged. Confirm with a second control pair before calling this a finding."
        };
      }
      if (!syntaxChanged && !booleanChanged) {
        return { classification: "negative", rationale: "Injection payloads did not change status or body shape." };
      }
      return { classification: "inconclusive", rationale: "Only one of the injection control pair changed." };
    }
    case "authorization-omission": {
      const omitted = input.variants[0];
      if (omitted.status === 401 || omitted.status === 403) {
        return { classification: "negative", rationale: "Removing authorization produced the expected denial." };
      }
      if (omitted.status === input.baselineStatus && omitted.body === input.baselineBody) {
        return {
          classification: "supported",
          rationale: "Authorization omission returned the same response. Treat as an access lead until identity or tenant evidence confirms impact."
        };
      }
      return { classification: "inconclusive", rationale: "Authorization omission changed the response without a clear denial or identical grant." };
    }
    case "resource-id": {
      const sameStatus = input.variants.filter((variant) => variant.status === input.baselineStatus);
      if (sameStatus.length === 0) {
        return { classification: "negative", rationale: "Substituted IDs did not keep the original success status." };
      }
      const bodyChanged = sameStatus.some((variant) => variant.body !== input.baselineBody);
      if (bodyChanged) {
        return {
          classification: "verification-required",
          rationale: "A substituted ID kept the same status with a different body. Confirm a resource or tenant difference before calling an access gain."
        };
      }
      return { classification: "inconclusive", rationale: "Substituted IDs kept the same status and body; that is not enough to claim an IDOR." };
    }
    default: {
      const _exhaustive: never = input.family;
      return _exhaustive;
    }
  }
}

export function summarizeExperimentClassification(result: Pick<ReplayExperimentResult, "classification" | "rationale" | "requestCost">) {
  return `${result.classification} (${result.requestCost} requests): ${result.rationale}`;
}
