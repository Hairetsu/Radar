export const DEFAULT_URL = "http://localhost:3000";

const explicitUrlPattern = /https?:\/\/[^\s"'<>]+/i;
const bareUrlPattern =
  /\b(?:(?:localhost|(?:\d{1,3}\.){3}\d{1,3})|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::\d{2,5})?(?:\/[^\s"'<>]*)?/i;
const trailingUrlPunctuation = /[),.;:!?]+$/;

function cleanUrlToken(value: string) {
  return String(value || "").trim().replace(trailingUrlPunctuation, "");
}

export function normalizeUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function firstUrlFromText(value: string) {
  const text = String(value || "");
  const explicit = text.match(explicitUrlPattern)?.[0];
  if (explicit) {
    return cleanUrlToken(explicit);
  }

  for (const match of text.matchAll(new RegExp(bareUrlPattern, "gi"))) {
    const token = match[0];
    const previous = text[Math.max((match.index || 0) - 1, 0)];
    if (previous === "@") {
      continue;
    }
    return normalizeUrl(cleanUrlToken(token));
  }

  return "";
}

export function originFromUrl(value: string) {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
}
