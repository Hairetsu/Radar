const { isAllowedTarget } = require("./allowlist.cjs");
const { safeJsonHeaders } = require("./headers.cjs");
const { truncateText } = require("./text.cjs");

function toCaptureEntry(requestId, request, rules) {
  const url = request.url || "";
  let host = "";
  let pathName = "";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    pathName = `${parsed.pathname}${parsed.search}`;
  } catch {
    host = url;
    pathName = "/";
  }

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

function proxyRequestToCapture(req, bodyText, rules) {
  const entry = toCaptureEntry(
    req.id,
    {
      method: req.method,
      url: req.url,
      headers: req.headers || {},
      postData: bodyText || ""
    },
    rules
  );
  entry.startedAt = new Date(req.timingEvents?.startTime || Date.now()).toISOString();
  entry.source = "proxy";
  entry.tls = req.url.startsWith("https:")
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

module.exports = { toCaptureEntry, proxyRequestToCapture };
