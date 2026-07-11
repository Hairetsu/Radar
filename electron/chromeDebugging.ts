export type CdpListEntry = {
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
};

function normalizedHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function cdpTargetMatchesRequestedUrl(target: CdpListEntry, requestedUrl: string) {
  if (target.type && target.type !== "page") {
    return false;
  }
  if (!target.webSocketDebuggerUrl || !target.url || !/^https?:\/\//i.test(target.url)) {
    return false;
  }

  try {
    const targetUrl = new URL(target.url);
    const requested = new URL(requestedUrl);
    if (targetUrl.origin === requested.origin) {
      return true;
    }
    return targetUrl.protocol === requested.protocol && normalizedHost(targetUrl.hostname) === normalizedHost(requested.hostname);
  } catch {
    return false;
  }
}

export function cdpTargetsIncludeRequestedPage(targets: CdpListEntry[], requestedUrl: string) {
  return targets.some((target) => cdpTargetMatchesRequestedUrl(target, requestedUrl));
}

export async function findCdpEndpointForUrl({
  requestedUrl,
  startPort = 9223,
  portCount = 80,
  fetchTargets
}: {
  requestedUrl: string;
  startPort?: number;
  portCount?: number;
  fetchTargets: (endpoint: string) => Promise<CdpListEntry[]>;
}) {
  for (let port = startPort; port < startPort + portCount; port += 1) {
    const endpoint = `http://127.0.0.1:${port}`;
    try {
      const targets = await fetchTargets(endpoint);
      if (cdpTargetsIncludeRequestedPage(targets, requestedUrl)) {
        return endpoint;
      }
    } catch {
      /* Ignore ports without a compatible Chrome debugging endpoint. */
    }
  }
  return "";
}
