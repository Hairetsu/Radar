import { useCallback, useEffect, useState } from "react";
import type { AiConnectionSummary } from "../../shared/windowCoordination.js";

const INITIAL_SUMMARY: AiConnectionSummary = {
  connected: false,
  checking: false,
  provider: "unverified",
  model: "",
  message: "Open AI Operator to verify",
  revision: 0
};

export function useAiConnectionSummary() {
  const [summary, setSummary] = useState(INITIAL_SUMMARY);

  useEffect(() => window.radar?.onAiConnectionChanged(setSummary), []);

  const setSettingsOpen = useCallback((open: boolean) => {
    if (open) {
      void window.radar?.openAiOperator("settings");
    }
  }, []);

  return {
    ...summary,
    statusLabel: summary.checking ? "checking" : summary.connected ? "live" : "off",
    canRun: summary.connected,
    setSettingsOpen
  };
}

