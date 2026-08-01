// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../../../types";
import { createRadarApiStub } from "../../../test/radarApiStub";
import { useAgentRuns } from "./useAgentRuns";

const NOW = "2026-07-31T00:00:00.000Z";

function agentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    createdAt: NOW,
    updatedAt: NOW,
    goal: "Inspect https://target.test",
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
    timeline: [],
    findings: [],
    ...overrides
  };
}

function createPorts() {
  return {
    current: {
      address: "https://target.test",
      targetText: "https://existing.test",
      setAddress: vi.fn(),
      setTargetText: vi.fn(),
      setActiveView: vi.fn(),
      setNotice: vi.fn()
    }
  };
}

describe("agent run lifecycle hook", () => {
  beforeEach(() => {
    window.radar = createRadarApiStub();
  });

  it("starts one scoped run and blocks a second active run", async () => {
    const portsRef = createPorts();
    if (!window.radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...window.radar,
      getTargets: vi.fn(async () => ["https://target.test"]),
      startAgentRun: vi.fn(async (request) =>
        agentRun({
          id: "started-run",
          goal: request.goal,
          profileId: request.profileId || "browser-assessment",
          status: "queued"
        })
      )
    };
    const { result } = renderHook(() => useAgentRuns(portsRef));

    await act(async () => result.current.startAgentRun());
    expect(portsRef.current.setNotice).toHaveBeenCalledWith("Describe a goal before starting AI-First.");

    act(() => {
      result.current.setAgentGoal("Inspect https://target.test");
      result.current.setAgentTutorialMode(true);
    });
    await act(async () => result.current.startAgentRun());

    expect(window.radar.startAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Inspect https://target.test",
        startUrl: "https://target.test",
        tutorialMode: true
      })
    );
    expect(portsRef.current.setAddress).toHaveBeenCalledWith("https://target.test");
    expect(result.current.activeAgentRun?.id).toBe("started-run");
    expect(result.current.executingAgentRun?.id).toBe("started-run");

    act(() => result.current.setAgentGoal("Inspect another page"));
    await act(async () => result.current.startAgentRun());
    expect(window.radar.startAgentRun).toHaveBeenCalledTimes(1);
    expect(portsRef.current.setNotice).toHaveBeenCalledWith(expect.stringContaining("already active"));
  });

  it("requires explicit scope consent before starting or continuing", async () => {
    const portsRef = createPorts();
    if (!window.radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...window.radar,
      getTargets: vi.fn(async () => []),
      startAgentRun: vi.fn(async () => agentRun({ id: "continued-run", status: "queued" }))
    };
    const { result } = renderHook(() => useAgentRuns(portsRef));

    act(() => result.current.setAgentGoal("Inspect https://outside.test/path"));
    await act(async () => result.current.startAgentRun());

    expect(portsRef.current.setTargetText).toHaveBeenCalledWith(
      "https://existing.test\nhttps://outside.test"
    );
    expect(portsRef.current.setActiveView).toHaveBeenCalledWith("scope");
    expect(window.radar.startAgentRun).not.toHaveBeenCalled();

    act(() => {
      result.current.setAgentRuns([
        agentRun({
          status: "failed",
          checkpoint: {
            startUrl: "https://outside.test/path",
            targetOrigin: "https://outside.test",
            stepCount: 2,
            replayCount: 0,
            workflowRequestCount: 0,
            elapsedMs: 1000,
            lastResumedAt: NOW
          }
        })
      ]);
    });
    await act(async () => result.current.continueAgentRun());
    expect(portsRef.current.setNotice).toHaveBeenCalledWith(expect.stringContaining("starting a continuation"));

    vi.mocked(window.radar.getTargets).mockResolvedValue(["https://outside.test"]);
    await act(async () => result.current.continueAgentRun());
    expect(window.radar.startAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ continuationOf: "run-1", startUrl: "https://outside.test/path" })
    );
  });

  it("pauses, resumes, stops, and recovers the selected run", async () => {
    const portsRef = createPorts();
    const recoverable = agentRun({
      status: "paused",
      timeline: [
        {
          id: "failed-step",
          createdAt: NOW,
          toolCall: { tool: "getPageText", input: {} }
        }
      ]
    });
    if (!window.radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...window.radar,
      pauseAgentRun: vi.fn(async () => agentRun({ status: "paused" })),
      resumeAgentRun: vi.fn(async () => agentRun({ status: "queued" })),
      stopAgentRun: vi.fn(async () => agentRun({ status: "stopped" })),
      recoverAgentRun: vi.fn(async () => recoverable)
    };
    const { result } = renderHook(() => useAgentRuns(portsRef));
    act(() => result.current.setAgentRuns([recoverable]));

    await act(async () => result.current.pauseAgentRun());
    expect(portsRef.current.setNotice).toHaveBeenCalledWith(expect.stringContaining("checkpoint preserved"));

    await act(async () => result.current.resumeAgentRun());
    expect(portsRef.current.setNotice).toHaveBeenCalledWith(expect.stringContaining("queued"));

    act(() => result.current.setAgentRuns([recoverable]));
    await act(async () => result.current.recoverAgentRun("failed-step", "draft-finding"));
    expect(result.current.agentGoal).toContain("getPageText");

    await act(async () => result.current.recoverAgentRun("failed-step", "skip-and-continue"));
    expect(portsRef.current.setNotice).toHaveBeenCalledWith(expect.stringContaining("skipped"));

    await act(async () => result.current.recoverAgentRun("failed-step", "stop-run"));
    expect(window.radar.stopAgentRun).toHaveBeenCalledWith("run-1");
  });

  it("surfaces bridge and lifecycle failures without hiding state", async () => {
    const portsRef = createPorts();
    const { result } = renderHook(() => useAgentRuns(portsRef));

    window.radar = undefined;
    act(() => result.current.setAgentGoal("Inspect target"));
    await act(async () => result.current.startAgentRun());
    expect(portsRef.current.setNotice).toHaveBeenCalledWith("Run in Electron to start an agent run.");

    window.radar = {
      ...createRadarApiStub(),
      pauseAgentRun: vi.fn().mockRejectedValue(new Error("pause failed")),
      resumeAgentRun: vi.fn().mockRejectedValue(new Error("resume failed")),
      recoverAgentRun: vi.fn().mockRejectedValue(new Error("recovery failed"))
    };
    const failed = agentRun({
      status: "failed",
      timeline: [{ id: "failed-step", createdAt: NOW, toolResult: { tool: "getPageText", ok: false, error: "failed" } }]
    });
    act(() => result.current.setAgentRuns([failed]));

    await act(async () => result.current.pauseAgentRun());
    await act(async () => result.current.resumeAgentRun());
    await act(async () => result.current.recoverAgentRun("failed-step", "retry-tool"));

    expect(portsRef.current.setNotice).toHaveBeenCalledWith("pause failed");
    expect(portsRef.current.setNotice).toHaveBeenCalledWith("resume failed");
    expect(portsRef.current.setNotice).toHaveBeenCalledWith("recovery failed");
  });
});
