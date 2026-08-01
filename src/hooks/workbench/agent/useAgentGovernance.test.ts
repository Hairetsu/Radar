// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentCapabilityState } from "../../../../shared/agentCapabilities.js";
import { createAgentMission } from "../../../../shared/agentMission.js";
import type { AgentRun } from "../../../types";
import { useAgentGovernance } from "./useAgentGovernance";

const NOW = "2026-07-31T00:00:00.000Z";

function pausedRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    createdAt: NOW,
    updatedAt: NOW,
    goal: "Inspect the target",
    profileId: "browser-assessment",
    status: "paused",
    policy: {
      maxRuntimeMs: 300_000,
      maxSteps: 40,
      maxReplay: 3,
      maxWorkflowRequests: 3,
      maxCaptureSample: 100,
      allowRawContext: false
    },
    mission: createAgentMission("Inspect the target", "https://target.test", NOW),
    capabilities: createAgentCapabilityState(),
    timeline: [],
    findings: [],
    ...overrides
  };
}

describe("agent governance hook", () => {
  const setAgentRuns = vi.fn();
  const setSelectedAgentRunId = vi.fn();
  const setNotice = vi.fn();

  beforeEach(() => {
    setAgentRuns.mockReset();
    setSelectedAgentRunId.mockReset();
    setNotice.mockReset();
    const radar = window.radar;
    if (!radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...radar,
      steerAgentMission: vi.fn(async () => pausedRun()),
      updateAgentCapabilities: vi.fn(async () => pausedRun()),
      listAgentRuns: vi.fn(async () => [pausedRun()])
    };
  });

  function render(activeAgentRun: AgentRun | null) {
    return renderHook(() =>
      useAgentGovernance({
        activeAgentRun,
        setAgentRuns,
        setSelectedAgentRunId,
        portsRef: { current: { setNotice } }
      })
    );
  }

  it("applies revision-bound mission and capability actions", async () => {
    const run = pausedRun();
    const { result } = render(run);

    await act(async () => {
      await result.current.steerAgentMission({ action: "add-objective", title: "Review API" });
      await result.current.updateAgentCapabilities({ action: "revoke", leaseId: "lease-1", reason: "Done" });
    });

    expect(window.radar?.steerAgentMission).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ action: "add-objective", expectedRevision: 0 })
    );
    expect(window.radar?.updateAgentCapabilities).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ action: "revoke", expectedRevision: 0 })
    );
    expect(setSelectedAgentRunId).toHaveBeenCalledWith("run-1");
    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining("revision"));
  });

  it("blocks governance without a paused saved run", async () => {
    const missing = render(null);
    await act(async () => {
      await missing.result.current.steerAgentMission({ action: "add-objective", title: "Review API" });
      await missing.result.current.updateAgentCapabilities({ action: "revoke", leaseId: "lease-1" });
    });
    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining("Select a saved"));

    setNotice.mockReset();
    const running = render(pausedRun({ status: "running" }));
    await act(async () => {
      await running.result.current.steerAgentMission({ action: "add-objective", title: "Review API" });
      await running.result.current.updateAgentCapabilities({ action: "revoke", leaseId: "lease-1" });
    });
    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining("Pause the run"));
  });

  it("refreshes durable runs after revision conflicts", async () => {
    const radar = window.radar;
    if (!radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...radar,
      steerAgentMission: vi.fn().mockRejectedValue(new Error("mission revision changed")),
      updateAgentCapabilities: vi.fn().mockRejectedValue(new Error("capability revision changed"))
    };
    const { result } = render(pausedRun());

    await act(async () => {
      await result.current.steerAgentMission({ action: "add-objective", title: "Review API" });
      await result.current.updateAgentCapabilities({ action: "revoke", leaseId: "lease-1" });
    });

    expect(window.radar.listAgentRuns).toHaveBeenCalledTimes(2);
    expect(setAgentRuns).toHaveBeenCalledWith(expect.any(Array));
    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining("revision changed"));
  });
});
