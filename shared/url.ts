export const DEFAULT_URL = "http://localhost:3000";

export function normalizeUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function originFromUrl(value: string) {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
}
