const DEFAULT_URL = "http://localhost:3000";

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function originFromUrl(value) {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
}

module.exports = { DEFAULT_URL, normalizeUrl, originFromUrl };
