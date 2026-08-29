import { useCallback } from "react";
import type {
  AppMode,
  CapturedRequest,
  ReplayDraft
} from "../../types";
import { formatHeaders } from "../../lib";
import type { AgentDomain } from "./useAgentDomain";
import type { AutomateDomain } from "./useAutomateDomain";
import type { FindingsDomain } from "./useFindingsDomain";
import type { InterceptDomain } from "./useInterceptDomain";
import type { RepeaterDomain } from "./useRepeaterDomain";
import type { WorkbenchShellDomain } from "./useWorkbenchShell";

export function useWorkbenchCrossDomainActions({
  shell,
  repeater,
  findings,
  automate,
  agent,
  intercept
}: {
  shell: WorkbenchShellDomain;
  repeater: RepeaterDomain;
  findings: FindingsDomain;
  automate: AutomateDomain;
  agent: AgentDomain;
  intercept: InterceptDomain;
}) {
  const promoteAutomateResultToFinding = useCallback(
    () =>
      findings.promoteAutomateResultToFinding(
        automate.activeAutomateSession,
        automate.selectedAutomateResult
      ),
    [
      automate.activeAutomateSession,
      automate.selectedAutomateResult,
      findings
    ]
  );
  const attachSelectedAutomateResultToFinding = useCallback(
    () =>
      findings.attachSelectedAutomateResultToFinding(
        automate.activeAutomateSession,
        automate.selectedAutomateResult
      ),
    [
      automate.activeAutomateSession,
      automate.selectedAutomateResult,
      findings
    ]
  );
  const applyAiDraft = useCallback(
    (draft: ReplayDraft) => {
      repeater.setDraft(draft);
      repeater.setHeadersText(formatHeaders(draft.headers));
      repeater.setLastResponse(null);
      repeater.setLastBurst(null);
      shell.setActiveView("repeater");
    },
    [repeater, shell]
  );
  const cloneToRepeater = useCallback(
    (capture: CapturedRequest | null) => {
      if (!capture) {
        return;
      }
      repeater.setDraft({
        method: capture.method,
        url: capture.url,
        headers: capture.requestHeaders,
        body: capture.requestBody || ""
      });
      repeater.setHeadersText(
        formatHeaders(capture.requestHeaders)
      );
      repeater.setLastResponse(null);
      repeater.setLastBurst(null);
      shell.setActiveView("repeater");
      shell.setNotice("Loaded in repeater");
    },
    [repeater, shell]
  );
  const cloneToClientOverride = useCallback(
    (capture: CapturedRequest | null) => {
      if (!capture) {
        return;
      }
      void intercept.createClientOverrideFromCapture(capture).then((created) => {
        if (created) {
          shell.setActiveView("intercept");
        }
      });
    },
    [intercept, shell]
  );
  const setAppMode = useCallback(
    (mode: AppMode) => {
      shell.setAppMode(mode);
      if (mode === "manual-first" && agent.executingAgentRun) {
        void window.radar
          ?.stopAgentRun(agent.executingAgentRun.id)
          .then((run) => {
            if (run) {
              agent.setAgentRuns((items) => [
                run,
                ...items.filter((item) => item.id !== run.id)
              ]);
            }
          });
      }
    },
    [agent, shell]
  );

  return {
    promoteAutomateResultToFinding,
    attachSelectedAutomateResultToFinding,
    applyAiDraft,
    cloneToRepeater,
    cloneToClientOverride,
    setAppMode
  };
}
