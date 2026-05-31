import type { ProxyProfile, ProxyProfileId } from "./domain.js";

const MAX_NOTES = 4000;

type ProxyProfileTemplate = Pick<ProxyProfile, "id" | "label" | "hint">;

export const PROXY_PROFILE_TEMPLATES: ProxyProfileTemplate[] = [
  {
    id: "radar-browser",
    label: "Radar Browser",
    hint: "Use Open Browser. Radar launches a dedicated browser profile and routes it through the local proxy."
  },
  {
    id: "external-browser",
    label: "External Browser",
    hint: "Point the browser HTTP and HTTPS proxy settings at Radar, then trust the generated CA manually."
  },
  {
    id: "cli",
    label: "CLI Tools",
    hint: "Export HTTP_PROXY and HTTPS_PROXY to the Radar proxy URL. Pass the CA path to tools that require one."
  },
  {
    id: "mobile-device",
    label: "Mobile / Device",
    hint: "Put the device on the same network, set its proxy to this machine, and install the CA only for this test profile."
  }
];

export function isProxyProfileId(value: unknown): value is ProxyProfileId {
  return PROXY_PROFILE_TEMPLATES.some((template) => template.id === value);
}

export function defaultProxyProfiles(now = ""): ProxyProfile[] {
  return PROXY_PROFILE_TEMPLATES.map((template) => ({
    ...template,
    notes: "",
    updatedAt: now
  }));
}

export function normalizeProxyProfile(input: { id?: unknown; notes?: unknown }, now = new Date().toISOString()): ProxyProfile | null {
  if (!isProxyProfileId(input.id)) {
    return null;
  }
  const template = PROXY_PROFILE_TEMPLATES.find((entry) => entry.id === input.id);
  if (!template) {
    return null;
  }
  return {
    ...template,
    notes: String(input.notes || "").trim().slice(0, MAX_NOTES),
    updatedAt: now
  };
}
