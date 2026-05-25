import { isAllowedTarget } from "./allowlist.js";
import type { CapturedRequest } from "./domain.js";
import { safeJsonHeaders } from "./headers.js";
import { truncateText } from "./text.js";

type CaptureRequestInput = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  postData?: string;
};

function parseCaptureUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathName: `${parsed.pathname}${parsed.search}`
    };
  } catch {
    return { host: url, pathName: "/" };
  }
}

export function toCaptureEntry({
  requestId,
  request,
  rules
}: {
  requestId: string;
  request: CaptureRequestInput;
  rules?: string[];
}): CapturedRequest {
  const url = request.url || "";
  const { host, pathName } = parseCaptureUrl(url);

  return {
    id: requestId,
    startedAt: new Date().toISOString(),
    method: request.method || "GET",
    url,
    host,
    path: pathName,
    requestHeaders: safeJsonHeaders(request.headers || {}),
    requestBody: truncateText(request.postData || ""),
    status: null,
    statusText: "",
    mimeType: "",
    type: "Other",
    responseHeaders: {},
    responseBody: "",
    durationMs: null,
    allowed: isAllowedTarget(url, rules),
    source: "browser"
  };
}

type ProxyRequest = {
  id: string;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  protocol?: string;
  destination?: { hostname?: string };
  timingEvents?: { startTime?: number };
};

export function proxyRequestToCapture({
  req,
  bodyText,
  rules
}: {
  req: ProxyRequest;
  bodyText: string;
  rules?: string[];
}): CapturedRequest {
  const entry = toCaptureEntry({
    requestId: req.id,
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers || {},
      postData: bodyText || ""
    },
    rules
  });
  entry.startedAt = new Date(req.timingEvents?.startTime || Date.now()).toISOString();
  entry.source = "proxy";
  entry.tls = req.url?.startsWith("https:")
    ? {
        protocol: req.protocol || "https",
        issuer: "Radar Local Proxy CA",
        subjectName: req.destination?.hostname || "",
        validFrom: 0,
        validTo: 0
      }
    : null;
  return entry;
}
