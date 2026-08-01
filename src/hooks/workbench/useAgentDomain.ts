import { useRef } from "react";
import type { AppMode } from "../../types";
import { useAgentGovernance } from "./agent/useAgentGovernance";
import { useAgentRunMemory } from "./agent/useAgentRunMemory";
import { useAgentRuns } from "./agent/useAgentRuns";
import {
  useAgentTimelineProjection,
  type AgentTimelineProjectionPorts
} from "./agent/useAgentTimelineProjection";

export interface AgentDomainPorts extends AgentTimelineProjectionPorts {
  address: string;
  setAddress: (address: string) => void;
  targetText: string;
  setTargetText: (text: string) => void;
  appMode: AppMode;
}

export type AgentDomain = ReturnType<typeof useAgentDomain>;

export function useAgentDomain(ports: AgentDomainPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const runs = useAgentRuns(portsRef);
  const { activeAgentRun, setAgentRuns, setSelectedAgentRunId } = runs;
  const { steerAgentMission, updateAgentCapabilities } = useAgentGovernance({
    activeAgentRun,
    setAgentRuns,
    setSelectedAgentRunId,
    portsRef
  });
  const runMemory = useAgentRunMemory(activeAgentRun, portsRef);

  useAgentTimelineProjection(activeAgentRun, ports.appMode, portsRef);

  return {
    ...runs,
    steerAgentMission,
    updateAgentCapabilities,
    ...runMemory
  };
}
