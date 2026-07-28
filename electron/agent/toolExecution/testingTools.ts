import type { AgentToolResult } from "../../../shared/agent-types.js";
import { isAllowedTarget } from "../../../shared/allowlist.js";
import { summarizeAutomateSession } from "../../../shared/automate.js";
import { diffReplayHistory } from "../../../shared/replayDiff.js";
import { createReplayTab, normalizeReplayTabState } from "../../../shared/replayTabs.js";
import type { AgentToolFamilyExecutor } from "./types.js";

export const executeTestingTool: AgentToolFamilyExecutor = async ({ call, deps }) => {
  let result: AgentToolResult;
  switch (call.tool) {
        case "getReplayContext": {
          const tabState = deps.getReplayTabState();
          const environments = deps.listReplayEnvironments();
          const collections = deps.listReplayCollections();
          result = {
            tool: call.tool,
            ok: true,
            data: {
              tabState,
              environments: environments.map((environment) => ({
                id: environment.id,
                name: environment.name,
                variableCount: Object.keys(environment.variables).length
              })),
              collections: collections.map((collection) => ({
                id: collection.id,
                name: collection.name,
                itemCount: collection.items.length
              }))
            }
          };
          break;
        }
        case "prepareReplayTab": {
          const current = deps.getReplayTabState();
          const tab = createReplayTab(call.input.name || `AI ${current.tabs.length + 1}`, call.input.draft);
          const next = normalizeReplayTabState({
            tabs: [...current.tabs, { ...tab, environmentId: call.input.environmentId || "" }],
            activeTabId: tab.id
          });
          deps.setReplayTabState(next);
          result = {
            tool: call.tool,
            ok: true,
            data: {
              tabId: tab.id,
              name: tab.name,
              draft: tab.draft,
              environmentId: call.input.environmentId || "",
              note: call.input.note || "Prepared replay tab for operator review."
            }
          };
          break;
        }
        case "compareReplayResults": {
          const tabState = deps.getReplayTabState();
          const tab =
            tabState.tabs.find((item) => item.id === (call.input.tabId || tabState.activeTabId)) ||
            tabState.tabs[0];
          if (!tab) {
            throw new Error("No repeater tab is available.");
          }
          const left = tab.history.find((entry) => entry.id === call.input.leftHistoryId);
          const right = tab.history.find((entry) => entry.id === call.input.rightHistoryId);
          if (!left || !right) {
            throw new Error("Replay history entries were not found in the selected tab.");
          }
          const summary = diffReplayHistory(left, right);
          result = {
            tool: call.tool,
            ok: true,
            data: {
              statusChanged: summary.statusChanged,
              statusBefore: summary.statusBefore,
              statusAfter: summary.statusAfter,
              latencyDeltaMs: summary.latencyDeltaMs,
              bodyLengthDelta: summary.bodyLengthDelta,
              identical: summary.identical
            }
          };
          break;
        }
        case "getAutomateContext": {
          const payloadSets = deps.listAutomatePayloadSets();
          const sessions = deps.listAutomateSessions();
          result = {
            tool: call.tool,
            ok: true,
            data: {
              payloadSets: payloadSets.map((payloadSet) => ({
                id: payloadSet.id,
                name: payloadSet.name,
                source: payloadSet.source,
                payloadCount: payloadSet.payloads.length,
                wordlistPath: payloadSet.wordlistPath
              })),
              sessions: sessions.map((item) => ({
                id: item.id,
                name: item.name,
                status: item.status,
                payloadCount: item.payloads.length,
                resultCount: item.results.length,
                clusterCount: item.clusters.length,
                matchCount: item.results.filter((entry) => entry.matchedRules.length > 0 || entry.extracts.length > 0).length,
                updatedAt: item.updatedAt
              }))
            }
          };
          break;
        }
        case "prepareAutomateDraft": {
          if (!isAllowedTarget(call.input.draft.url, deps.allowlist())) {
            throw new Error(`Prepared Automate URL is out of scope: ${call.input.draft.url}`);
          }
          result = {
            tool: call.tool,
            ok: true,
            data: {
              draft: call.input.draft,
              payloads: call.input.payloads,
              rules: call.input.rules || [],
              name: call.input.name || "AI prepared run",
              environmentId: call.input.environmentId || "",
              note: call.input.note || "Prepared Automate controls for operator review."
            }
          };
          break;
        }
        case "analyzeAutomateResults": {
          const sessions = deps.listAutomateSessions();
          const session =
            sessions.find((item) => item.id === call.input.sessionId) ||
            sessions[0];
          if (!session) {
            throw new Error("No Automate session is available to analyze.");
          }
          const summary = summarizeAutomateSession(session);
          result = {
            tool: call.tool,
            ok: true,
            data: {
              sessionId: session.id,
              status: session.status,
              resultCount: summary.resultCount,
              failures: summary.failures,
              matches: summary.matches,
              clusters: session.clusters,
              outlierResultIds: session.clusters
                .filter((cluster) => cluster.count === 1)
                .map((cluster) => cluster.representativeResultId)
            }
          };
          break;
        }
    default:
      return null;
  }
  return result;
};

