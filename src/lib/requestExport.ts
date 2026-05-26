import type { CapturedRequest } from "../../shared/domain";

export type RequestExportFormat = "curl" | "bash" | "python" | "fetch" | "raw";

export const REQUEST_EXPORT_LABELS: Record<RequestExportFormat, string> = {
  curl: "cURL",
  bash: "Bash",
  python: "Python",
  fetch: "Fetch",
  raw: "Raw HTTP"
};

function shellQuote(value: string) {
  if (value.length === 0) {
    return "''";
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function jsonString(value: string) {
  return JSON.stringify(value);
}

function headerEntries(capture: CapturedRequest) {
  return Object.entries(capture.requestHeaders).filter(([name]) => !name.trim().startsWith(":"));
}

function hasRequestBody(capture: CapturedRequest) {
  return capture.requestBody.length > 0;
}

function formatCurl(capture: CapturedRequest) {
  const parts = [
    "curl -i",
    `-X ${shellQuote(capture.method || "GET")}`,
    ...headerEntries(capture).map(([name, value]) => `-H ${shellQuote(`${name}: ${value}`)}`),
    ...(hasRequestBody(capture) ? [`--data-raw ${shellQuote(capture.requestBody)}`] : []),
    shellQuote(capture.url)
  ];

  return parts.map((part, index) => (index === 0 ? part : `  ${part}`)).join(" \\\n");
}

function formatPython(capture: CapturedRequest) {
  const headers = Object.fromEntries(headerEntries(capture));
  const args = [
    `    ${jsonString(capture.method || "GET")},`,
    "    url,",
    "    headers=headers,",
    ...(hasRequestBody(capture) ? [`    data=${jsonString(capture.requestBody)},`] : [])
  ];

  return [
    "import requests",
    "",
    `url = ${jsonString(capture.url)}`,
    `headers = ${JSON.stringify(headers, null, 4)}`,
    "",
    "response = requests.request(",
    ...args,
    ")",
    "print(response.status_code)",
    "print(response.text)"
  ].join("\n");
}

function formatFetch(capture: CapturedRequest) {
  const options: Record<string, unknown> = {
    method: capture.method || "GET",
    headers: Object.fromEntries(headerEntries(capture))
  };
  if (hasRequestBody(capture) && !["GET", "HEAD"].includes((capture.method || "GET").toUpperCase())) {
    options.body = capture.requestBody;
  }

  return [
    `const response = await fetch(${jsonString(capture.url)}, ${JSON.stringify(options, null, 2)});`,
    "console.log(response.status, await response.text());"
  ].join("\n");
}

function formatRawHttp(capture: CapturedRequest) {
  let target = capture.path || "/";
  let host = capture.host;

  try {
    const parsed = new URL(capture.url);
    target = `${parsed.pathname || "/"}${parsed.search}`;
    host = parsed.host;
  } catch {
    // Keep captured host/path fallbacks for malformed URLs.
  }

  const entries = headerEntries(capture);
  const hasHostHeader = entries.some(([name]) => name.toLowerCase() === "host");
  const headerLines = [
    ...(!hasHostHeader && host ? [`Host: ${host}`] : []),
    ...entries.map(([name, value]) => `${name}: ${value}`)
  ];

  return [
    `${capture.method || "GET"} ${target || "/"} HTTP/1.1`,
    ...headerLines,
    "",
    ...(hasRequestBody(capture) ? [capture.requestBody] : [])
  ].join("\n");
}

export function formatCapturedRequest(capture: CapturedRequest, format: RequestExportFormat) {
  switch (format) {
    case "bash":
      return ["#!/usr/bin/env bash", "set -euo pipefail", "", formatCurl(capture)].join("\n");
    case "python":
      return formatPython(capture);
    case "fetch":
      return formatFetch(capture);
    case "raw":
      return formatRawHttp(capture);
    case "curl":
    default:
      return formatCurl(capture);
  }
}
