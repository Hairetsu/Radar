import type { CapturedRequest } from "./domain.js";
import type { SitemapNode } from "./sitemap.js";

export type EndpointInventory = {
  queryParams: string[];
  bodyKeys: string[];
  formFields: string[];
  contentTypes: string[];
  authSignals: string[];
  examples: Array<{ captureId: string; startedAt: string }>;
};

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function parseQueryParams(url: string) {
  try {
    const parsed = new URL(url);
    return [...parsed.searchParams.keys()];
  } catch {
    return [];
  }
}

function parseJsonKeys(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

function parseFormFields(body: string, mimeType: string) {
  if (!mimeType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return [];
  }
  return body
    .split("&")
    .map((pair) => pair.split("=")[0]?.trim())
    .filter(Boolean);
}

function authSignalsForCapture(capture: CapturedRequest) {
  const signals: string[] = [];
  const authHeader = Object.entries(capture.requestHeaders).find(([key]) => key.toLowerCase() === "authorization");
  if (authHeader) {
    signals.push(`authorization:${authHeader[1].split(" ")[0]?.toLowerCase() || "present"}`);
  }
  const cookieHeader = Object.entries(capture.requestHeaders).find(([key]) => key.toLowerCase() === "cookie");
  if (cookieHeader) {
    signals.push("cookie:present");
  }
  if (capture.status === 401 || capture.status === 403) {
    signals.push(`status:${capture.status}`);
  }
  return signals;
}

export function buildEndpointInventory(captures: CapturedRequest[]): EndpointInventory {
  const inventory: EndpointInventory = {
    queryParams: [],
    bodyKeys: [],
    formFields: [],
    contentTypes: [],
    authSignals: [],
    examples: []
  };

  for (const capture of captures) {
    inventory.queryParams.push(...parseQueryParams(capture.url));
    inventory.bodyKeys.push(...parseJsonKeys(capture.requestBody));
    inventory.formFields.push(...parseFormFields(capture.requestBody, capture.mimeType));
    inventory.contentTypes.push(capture.mimeType);
    inventory.authSignals.push(...authSignalsForCapture(capture));
    inventory.examples.push({ captureId: capture.id, startedAt: capture.startedAt });
  }

  inventory.queryParams = uniqueSorted(inventory.queryParams);
  inventory.bodyKeys = uniqueSorted(inventory.bodyKeys);
  inventory.formFields = uniqueSorted(inventory.formFields);
  inventory.contentTypes = uniqueSorted(inventory.contentTypes);
  inventory.authSignals = uniqueSorted(inventory.authSignals);
  inventory.examples = inventory.examples
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 8);
  return inventory;
}

export function endpointInventoryForNode(node: SitemapNode, captures: CapturedRequest[]) {
  const captureSet = new Set(node.captureIds);
  return buildEndpointInventory(captures.filter((capture) => captureSet.has(capture.id)));
}
