const MAX_CAPTURED_BODY = 120_000;

function truncateText(value, limit = MAX_CAPTURED_BODY) {
  if (!value) {
    return "";
  }
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
}

function statusTone(status) {
  if (!status) {
    return "ghost";
  }
  if (status >= 500) {
    return "danger";
  }
  if (status >= 400) {
    return "warn";
  }
  if (status >= 300) {
    return "move";
  }
  return "good";
}

function elapsed(value) {
  return typeof value === "number" ? `${value}ms` : "—";
}

function bodyPreview(value) {
  if (!value) {
    return "";
  }
  return value.length > 5000 ? `${value.slice(0, 5000)}\n\n[preview truncated]` : value;
}

function tlsLine(capture) {
  if (!capture?.tls) {
    return "TLS: none";
  }
  return `TLS: ${capture.tls.protocol || "unknown"} | ${capture.tls.subjectName || "unknown subject"} | ${
    capture.tls.issuer || "unknown issuer"
  }`;
}

module.exports = {
  MAX_CAPTURED_BODY,
  truncateText,
  statusTone,
  elapsed,
  bodyPreview,
  tlsLine
};
