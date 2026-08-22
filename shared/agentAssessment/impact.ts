import type { EndpointImpact } from "./types.js";

const STATE_CHANGING_PATH = /(profile|account|password|purchase|checkout|upload|message|mail|delete|logout|reset|register|signup)/i;
const AUTH_PATH = /(login|signin|oauth|token|session|auth)/i;
const LOOKUP_PATH = /(search|filter|lookup|query|cargo|invoice|preview|options)/i;

export function classifyEndpointImpact(input: { method: string; path: string }): EndpointImpact {
  const method = String(input.method || "").toUpperCase();
  const path = String(input.path || "");
  if (!method || !path) {
    return "unknown";
  }
  if (method === "DELETE") {
    return "state-changing";
  }
  if (STATE_CHANGING_PATH.test(path) && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return "state-changing";
  }
  if (AUTH_PATH.test(path) && method !== "OPTIONS") {
    return "authentication";
  }
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return "read-only";
  }
  if (method === "POST" && LOOKUP_PATH.test(path)) {
    return "read-only";
  }
  if (method === "PUT" || method === "PATCH") {
    return "state-changing";
  }
  return "unknown";
}

export function impactAllowsReadOnlyProbes(impact: EndpointImpact) {
  return impact === "read-only";
}
