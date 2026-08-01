import type {
  AgentTimelineEntry,
  AgentToolCall,
  AgentToolResult
} from "../../../../shared/agent-types.js";

type ToolResultData<TTool extends AgentToolResult["tool"]> = Extract<
  AgentToolResult,
  { tool: TTool; ok: true }
>["data"];

export type AgentTimelineIntent =
  | { type: "show-view"; view: Extract<AgentToolCall, { tool: "showView" }>["input"]["view"] }
  | { type: "load-replay-draft"; draft: Extract<AgentToolCall, { tool: "sendReplay" }>["input"]["draft"] }
  | { type: "set-replay-response"; response: ToolResultData<"sendReplay"> }
  | { type: "select-capture"; captureId: string }
  | { type: "set-intercept-queue"; queue: ToolResultData<"getInterceptQueue">["queue"] }
  | { type: "prepare-intercept-edit"; data: ToolResultData<"prepareInterceptEdit"> }
  | { type: "prepare-traffic-query"; data: ToolResultData<"prepareTrafficQuery"> }
  | { type: "show-sitemap" }
  | { type: "prepare-replay-tab"; data: ToolResultData<"prepareReplayTab"> }
  | { type: "prepare-automate-draft"; data: ToolResultData<"prepareAutomateDraft"> }
  | { type: "prepare-workflow-draft"; data: ToolResultData<"prepareWorkflowDraft"> }
  | { type: "notice"; message: string }
  | { type: "show-automate-analysis"; data: ToolResultData<"analyzeAutomateResults"> }
  | { type: "show-replay-comparison"; data: ToolResultData<"compareReplayResults"> };

export function agentTimelineIntents(entries: AgentTimelineEntry[]) {
  const intents: AgentTimelineIntent[] = [];

  for (const entry of entries) {
    const appliesVisibleToolCall = entry.phase === "tool-call" || entry.phase === undefined;
    if (appliesVisibleToolCall && entry.toolCall?.tool === "showView") {
      intents.push({ type: "show-view", view: entry.toolCall.input.view });
    }
    if (appliesVisibleToolCall && entry.toolCall?.tool === "sendReplay") {
      intents.push({ type: "load-replay-draft", draft: entry.toolCall.input.draft });
    }

    const result = entry.toolResult;
    if (!result?.ok) continue;

    switch (result.tool) {
      case "sendReplay":
        intents.push({ type: "set-replay-response", response: result.data });
        break;
      case "getCaptures": {
        const firstCapture =
          result.data.captures.find((capture) => capture.allowed) || result.data.captures[0];
        if (firstCapture) intents.push({ type: "select-capture", captureId: firstCapture.id });
        break;
      }
      case "getInterceptQueue":
        intents.push({ type: "set-intercept-queue", queue: result.data.queue });
        break;
      case "prepareInterceptEdit":
        intents.push({ type: "prepare-intercept-edit", data: result.data });
        break;
      case "prepareTrafficQuery":
        intents.push({ type: "prepare-traffic-query", data: result.data });
        break;
      case "getSitemapCoverage":
        intents.push({ type: "show-sitemap" });
        break;
      case "prepareReplayTab":
        intents.push({ type: "prepare-replay-tab", data: result.data });
        break;
      case "prepareAutomateDraft":
        intents.push({ type: "prepare-automate-draft", data: result.data });
        break;
      case "prepareWorkflowDraft":
        intents.push({ type: "prepare-workflow-draft", data: result.data });
        break;
      case "proposeRunMemory":
        intents.push({ type: "notice", message: `AI proposed run memory: ${result.data.memory.title}` });
        break;
      case "analyzeAutomateResults":
        intents.push({ type: "show-automate-analysis", data: result.data });
        break;
      case "compareReplayResults":
        intents.push({ type: "show-replay-comparison", data: result.data });
        break;
      default:
        break;
    }
  }

  return intents;
}
