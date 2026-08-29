import type { useAgentDomain } from "./useAgentDomain";
import type { useAutomateDomain } from "./useAutomateDomain";
import type { useBrowserDomain } from "./useBrowserDomain";
import type { useFindingsDomain } from "./useFindingsDomain";
import type { useInterceptDomain } from "./useInterceptDomain";
import type { usePluginsDomain } from "./usePluginsDomain";
import type { useRepeaterDomain } from "./useRepeaterDomain";
import type { useScopeDomain } from "./useScopeDomain";
import type { useSslProxyDomain } from "./useSslProxyDomain";
import type { useTrafficDomain } from "./useTrafficDomain";
import type { useWebSocketDomain } from "./useWebSocketDomain";
import type { useWorkflowsDomain } from "./useWorkflowsDomain";
import {
  hydrateRepeaterDraft,
  workflowDryRunFor,
  type WorkbenchHydrationPorts
} from "./workbenchHydration";

type WorkbenchHydrationDomains = {
  scope: ReturnType<typeof useScopeDomain>;
  traffic: ReturnType<typeof useTrafficDomain>;
  sslProxy: ReturnType<typeof useSslProxyDomain>;
  webSocket: ReturnType<typeof useWebSocketDomain>;
  browser: ReturnType<typeof useBrowserDomain>;
  intercept: ReturnType<typeof useInterceptDomain>;
  agent: ReturnType<typeof useAgentDomain>;
  findings: ReturnType<typeof useFindingsDomain>;
  workflows: ReturnType<typeof useWorkflowsDomain>;
  plugins: ReturnType<typeof usePluginsDomain>;
  repeater: ReturnType<typeof useRepeaterDomain>;
  automate: ReturnType<typeof useAutomateDomain>;
};

export function createWorkbenchHydrationPorts(
  domains: WorkbenchHydrationDomains
): WorkbenchHydrationPorts {
  const {
    scope,
    traffic,
    sslProxy,
    webSocket,
    browser,
    intercept,
    agent,
    findings,
    workflows,
    plugins,
    repeater,
    automate
  } = domains;

  return {
    scope: {
      replace: (targets) => {
        scope.setTargets(targets);
        scope.setTargetText(targets.join("\n"));
      }
    },
    traffic: {
      replace: traffic.setCaptures,
      resetSelection: () => {
        traffic.setSelectedId("");
        traffic.setSelectedIds([]);
        traffic.selectionAnchorRef.current = "";
        repeater.setLastResponse(null);
        repeater.setLastBurst(null);
      }
    },
    sslProxy: {
      replaceEvents: sslProxy.setSslEvents,
      replaceProfiles: sslProxy.setProxyProfiles,
      replaceState: sslProxy.setProxyState
    },
    webSocket: {
      replace: webSocket.setWebSocketEvents,
      resetReplay: () => {
        webSocket.setWebSocketReplayDraft(null);
        webSocket.setWebSocketReplayResult(null);
      }
    },
    browser: { replace: browser.setBrowserState },
    intercept: {
      replace: (state, rules, matchReplaceRules, clientOverrides) => {
        intercept.setInterceptState(state);
        intercept.setInterceptRules(rules);
        intercept.setInterceptRulesText(JSON.stringify(rules, null, 2));
        intercept.setMatchReplaceRules(matchReplaceRules);
        intercept.setMatchReplaceRulesText(JSON.stringify(matchReplaceRules, null, 2));
        intercept.setClientOverrides(clientOverrides);
      },
      refreshState: intercept.setInterceptState
    },
    agents: {
      replace: (runs, memory) => {
        agent.setAgentRuns(runs);
        agent.setAgentRunMemory(memory);
      },
      select: agent.setSelectedAgentRunId
    },
    findings: {
      replace: (nextFindings, annotations) => {
        findings.setEvidenceAnnotations(annotations);
        findings.setFindings(nextFindings);
        findings.setSelectedFindingId(nextFindings[0]?.id || "");
        findings.setFindingReport(null);
      },
      refresh: (nextFindings) => {
        findings.setFindings(nextFindings);
        findings.setSelectedFindingId((current) => current || nextFindings[0]?.id || "");
      }
    },
    workflows: {
      replace: (definitions, runs) => {
        workflows.setWorkflows(definitions);
        workflows.setSelectedWorkflowId(definitions[0]?.id || "");
        workflows.setAiPreparedWorkflowDraft(null);
        workflows.setWorkflowRuns(runs);
        workflows.setSelectedWorkflowRunId(runs[0]?.id || "");
        workflows.setWorkflowDryRun(workflowDryRunFor(definitions));
        workflows.setWorkflowRevisions([]);
      },
      refreshRuns: (runs) => {
        workflows.setWorkflowRuns(runs);
        workflows.setSelectedWorkflowRunId((current) => current || runs[0]?.id || "");
      }
    },
    plugins: {
      replace: (nextPlugins, audit) => {
        plugins.setPlugins(nextPlugins);
        plugins.setPluginInstallPreview(null);
        plugins.setPluginAudit(audit);
        plugins.setPluginApiResult(null);
        plugins.setPluginPanelRender(null);
        plugins.setPluginDeveloperValidation(null);
        plugins.setPluginApiRequestText(
          nextPlugins[0]
            ? JSON.stringify(
                {
                  pluginId: nextPlugins[0].id,
                  action: "captures:list",
                  input: { query: "" }
                },
                null,
                2
              )
            : ""
        );
      }
    },
    repeater: {
      replace: (tabs, environments, collections) => {
        repeater.setReplayTabState(tabs);
        repeater.setReplayEnvironments(environments);
        repeater.setReplayCollections(collections);
        hydrateRepeaterDraft(tabs, repeater.setHeadersText);
        repeater.setDiffLeftHistoryId("");
        repeater.setDiffRightHistoryId("");
      }
    },
    automate: {
      replace: (payloadSets, sessions) => {
        automate.setAutomatePayloadSets(payloadSets);
        automate.setAutomateSessions(sessions);
        automate.setActiveAutomateSessionId(sessions[0]?.id || "");
      },
      refreshSessions: (sessions) => {
        automate.setAutomateSessions(sessions);
        automate.setActiveAutomateSessionId((current) => current || sessions[0]?.id || "");
      }
    }
  };
}
