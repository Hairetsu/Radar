import type { CapturedRequest, ReplayDraft, SslEvent } from "../../shared/domain.js";
import type { AiViewContext, AiWorkView } from "../../shared/ai-types.js";

export function contextBlockedReason({
  view,
  captures,
  viewContext
}: {
  view?: AiWorkView;
  captures: CapturedRequest[];
  viewContext?: AiViewContext;
}) {
  const activeView = view || viewContext?.view;

  switch (activeView) {
    case "repeater":
      if (captures.length === 0 && !viewContext?.draft?.url?.trim()) {
        return "Load a repeater draft or select a capture in Traffic.";
      }
      return undefined;
    case "scope":
      if (!viewContext?.targets?.some((target) => target.trim())) {
        return "Add at least one scope target.";
      }
      return undefined;
    case "ssl":
      if (!viewContext?.sslEvents?.length && !captures.some((capture) => capture.tls)) {
        return "Record SSL events or select a capture with TLS details.";
      }
      return undefined;
    case "traffic":
    default:
      if (captures.length === 0) {
        return "Select at least one capture in Traffic.";
      }
      return undefined;
  }
}

function formatDraft(draft: ReplayDraft) {
  return [
    "REPEATER DRAFT:",
    `${draft.method} ${draft.url}`,
    "HEADERS:",
    JSON.stringify(draft.headers || {}, null, 2),
    "BODY:",
    draft.body || "(empty)"
  ].join("\n");
}

function formatLastResponse(response: NonNullable<AiViewContext["lastResponse"]>) {
  return [
    "LAST REPLAY RESPONSE:",
    `${response.status} ${response.statusText}`,
    "BODY:",
    response.body || "(empty)"
  ].join("\n");
}

function formatSslEvent(event: SslEvent) {
  return [
    `--- ssl:${event.id} ---`,
    `${event.trusted ? "TRUSTED" : "BLOCKED"}: ${event.error}`,
    event.url,
    event.subjectName || event.issuerName || event.createdAt
  ].join("\n");
}

export function appendViewContext(base: string, viewContext?: AiViewContext) {
  if (!viewContext) {
    return base;
  }

  const blocks: string[] = [base];

  if (viewContext.view) {
    blocks.push("", `ACTIVE VIEW: ${viewContext.view}`);
  }

  if (viewContext.targets?.length) {
    blocks.push("", "SCOPE TARGETS:", viewContext.targets.join("\n"));
  }

  if (viewContext.draft) {
    blocks.push("", formatDraft(viewContext.draft));
  }

  if (viewContext.lastResponse) {
    blocks.push("", formatLastResponse(viewContext.lastResponse));
  }

  if (viewContext.sslEvents?.length) {
    blocks.push("", "SSL EVENTS:", viewContext.sslEvents.map(formatSslEvent).join("\n\n"));
  }

  if (viewContext.proxyUrl || viewContext.proxyRunning !== undefined) {
    blocks.push(
      "",
      "PROXY STATE:",
      `running: ${viewContext.proxyRunning ? "yes" : "no"}`,
      `proxy_url: ${viewContext.proxyUrl || "(none)"}`,
      `ca_cert: ${viewContext.caCertPath || "(none)"}`
    );
  }

  return blocks.join("\n");
}
