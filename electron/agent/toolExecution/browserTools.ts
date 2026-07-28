import type { AgentToolResult } from "../../../shared/agent-types.js";
import type { BrowserState } from "../../../shared/domain.js";
import type { AgentToolFamilyExecutor } from "./types.js";

function browserStateMatchesRequestedUrl(state: BrowserState, requestedUrl: string) {
  if (!state.open || !state.url) {
    return false;
  }
  try {
    return new URL(state.url).href === new URL(requestedUrl).href;
  } catch {
    return state.url === requestedUrl;
  }
}

function browserToolSuccess(tool: "openBrowser" | "navigateBrowser", data: BrowserState) {
  return tool === "openBrowser"
    ? ({ tool, ok: true, data } satisfies AgentToolResult)
    : ({ tool, ok: true, data } satisfies AgentToolResult);
}

async function runBrowserTool({
  tool,
  url,
  action,
  getBrowserState
}: {
  tool: "openBrowser" | "navigateBrowser";
  url: string;
  action: (url: string) => Promise<BrowserState>;
  getBrowserState: () => BrowserState;
}) {
  try {
    return browserToolSuccess(tool, await action(url));
  } catch (error) {
    try {
      const state = getBrowserState();
      if (browserStateMatchesRequestedUrl(state, url)) {
        return browserToolSuccess(tool, state);
      }
    } catch {
      /* Preserve the original browser action failure. */
    }
    throw error;
  }
}

export const executeBrowserTool: AgentToolFamilyExecutor = async ({ call, deps }) => {
  let result: AgentToolResult;
  switch (call.tool) {
        case "getBrowserState":
          result = { tool: call.tool, ok: true, data: deps.getBrowserState() };
          break;
        case "showView":
          result = { tool: call.tool, ok: true, data: { view: call.input.view } };
          break;
        case "openBrowser":
          result = await runBrowserTool({
            tool: call.tool,
            url: call.input.url,
            action: deps.openBrowser,
            getBrowserState: deps.getBrowserState
          });
          break;
        case "navigateBrowser":
          result = await runBrowserTool({
            tool: call.tool,
            url: call.input.url,
            action: deps.navigateBrowser,
            getBrowserState: deps.getBrowserState
          });
          break;
        case "waitForNetworkIdle":
          result = { tool: call.tool, ok: true, data: await deps.waitForNetworkIdle(call.input) };
          break;
        case "getPageText":
          result = { tool: call.tool, ok: true, data: await deps.getPageText() };
          break;
        case "getDomSummary":
          result = { tool: call.tool, ok: true, data: await deps.getDomSummary() };
          break;
        case "getClickableElements":
          result = { tool: call.tool, ok: true, data: await deps.getClickableElements() };
          break;
        case "clickElement":
          result = { tool: call.tool, ok: true, data: await deps.clickElement(call.input) };
          break;
        case "fillInput":
          result = { tool: call.tool, ok: true, data: await deps.fillInput(call.input) };
          break;
        case "submitForm":
          result = { tool: call.tool, ok: true, data: await deps.submitForm(call.input) };
          break;
        case "getCookies":
          result = { tool: call.tool, ok: true, data: await deps.getCookies() };
          break;
        case "getStorageState":
          result = { tool: call.tool, ok: true, data: await deps.getStorageState() };
          break;
        case "saveAuthState":
          result = { tool: call.tool, ok: true, data: await deps.saveAuthState(call.input) };
          break;
        case "loadAuthState":
          result = { tool: call.tool, ok: true, data: await deps.loadAuthState(call.input) };
          break;
        case "listAuthStates":
          result = { tool: call.tool, ok: true, data: await deps.listAuthStates() };
          break;
        case "compareAuthStates":
          result = { tool: call.tool, ok: true, data: await deps.compareAuthStates(call.input) };
          break;
        case "getIdentityLabContext":
          result = { tool: call.tool, ok: true, data: await deps.getIdentityLabContext() };
          break;
        case "activateIdentityProfile":
          result = { tool: call.tool, ok: true, data: await deps.activateIdentityProfile(call.input) };
          break;
        case "verifyIdentityProfile":
          result = { tool: call.tool, ok: true, data: await deps.verifyIdentityProfile(call.input) };
          break;
    default:
      return null;
  }
  return result;
};

