import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type {
  AgentCapabilityAction,
  AgentCapabilityActionRequest,
  AgentMissionSteeringAction,
  AgentMissionSteeringRequest,
  AgentRun
} from "../../../types";

type NoticePorts = { setNotice: (message: string) => void };

export function useAgentGovernance({
  activeAgentRun,
  setAgentRuns,
  setSelectedAgentRunId,
  portsRef
}: {
  activeAgentRun: AgentRun | null;
  setAgentRuns: Dispatch<SetStateAction<AgentRun[]>>;
  setSelectedAgentRunId: Dispatch<SetStateAction<string>>;
  portsRef: MutableRefObject<NoticePorts>;
}) {
  const steerAgentMission = useCallback(
    async (action: AgentMissionSteeringAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run?.mission) {
        portsRef.current.setNotice("Select a saved AI-First run with a Mission Graph before steering it.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        portsRef.current.setNotice("Pause the run and wait for the active step to settle before steering its Mission Graph.");
        return;
      }
      const request: AgentMissionSteeringRequest = { ...action, expectedRevision: run.mission.revision };
      try {
        const steered = await window.radar.steerAgentMission(run.id, request);
        if (steered) {
          setAgentRuns((items) => [steered, ...items.filter((item) => item.id !== steered.id)]);
          setSelectedAgentRunId(steered.id);
          portsRef.current.setNotice(`Mission Graph updated to revision ${steered.mission?.revision ?? run.mission.revision}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mission steering could not be applied.";
        if (message.includes("revision")) {
          setAgentRuns(await window.radar.listAgentRuns());
        }
        portsRef.current.setNotice(message);
      }
    },
    [activeAgentRun, portsRef, setAgentRuns, setSelectedAgentRunId]
  );

  const updateAgentCapabilities = useCallback(
    async (action: AgentCapabilityAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run) {
        portsRef.current.setNotice("Select a saved AI-First run before changing capability leases.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        portsRef.current.setNotice("Pause the run and wait for the active step to settle before changing capability leases.");
        return;
      }
      const expectedRevision = run.capabilities?.revision || 0;
      const request: AgentCapabilityActionRequest = { ...action, expectedRevision };
      try {
        const updated = await window.radar.updateAgentCapabilities(run.id, request);
        if (updated) {
          setAgentRuns((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
          setSelectedAgentRunId(updated.id);
          portsRef.current.setNotice(
            action.action === "grant" && action.resumeAfterApproval
              ? updated.status === "queued" || updated.status === "running"
                ? `Capability ledger advanced to revision ${updated.capabilities?.revision ?? expectedRevision}; the run is resuming.`
                : updated.timeline.at(-1)?.note || "Capability approved, but the run remains paused."
              : `Capability ledger updated to revision ${updated.capabilities?.revision ?? expectedRevision}.`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Capability lease action failed.";
        if (message.includes("revision")) {
          setAgentRuns(await window.radar.listAgentRuns());
        }
        portsRef.current.setNotice(message);
      }
    },
    [activeAgentRun, portsRef, setAgentRuns, setSelectedAgentRunId]
  );

  return { steerAgentMission, updateAgentCapabilities };
}
