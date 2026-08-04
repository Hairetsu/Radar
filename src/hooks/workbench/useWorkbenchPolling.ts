import { useEffect, useRef } from "react";
import type { LocalProfile, LocalSessionSummary } from "../../types";
import {
  applyLiveWorkbenchSnapshot,
  loadLiveWorkbenchSnapshot,
  type WorkbenchHydrationPorts
} from "./workbenchHydration";

interface WorkbenchPollingPorts {
  hydration: WorkbenchHydrationPorts;
  replaceLocalLists: (
    profiles: LocalProfile[],
    sessions: LocalSessionSummary[]
  ) => void;
}

export function useWorkbenchPolling(
  activeProfileId: string,
  ports: WorkbenchPollingPorts
) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  useEffect(() => {
    if (!activeProfileId) {
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const load = async () => {
      if (!window.radar || cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const [profiles, sessions] = await Promise.all([
          window.radar.listLocalProfiles(),
          window.radar.listLocalSessions(activeProfileId)
        ]);
        if (!cancelled) {
          portsRef.current.replaceLocalLists(profiles, sessions);
        }
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProfileId]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let preferredRunId = "";
    const load = async (requestedRunId = "") => {
      if (requestedRunId) {
        preferredRunId = requestedRunId;
      }
      if (!window.radar || cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const snapshot = await loadLiveWorkbenchSnapshot();
        if (!cancelled && snapshot) {
          applyLiveWorkbenchSnapshot(snapshot, portsRef.current.hydration);
          if (preferredRunId && snapshot.agentRuns.some((run) => run.id === preferredRunId)) {
            portsRef.current.hydration.agents.select(preferredRunId);
            preferredRunId = "";
          }
        }
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 1_500);
    const unsubscribe = window.radar?.onAgentChanged((event) => {
      void load(event.runId);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, []);
}
