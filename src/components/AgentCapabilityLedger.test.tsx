// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../types";
import { AgentCapabilityLedger } from "./AgentCapabilityLedger";

const NOW = "2026-08-15T00:00:00.000Z";

function pausedRun(): AgentRun {
  return {
    id: "run-approval",
    sessionId: "session-test",
    createdAt: NOW,
    updatedAt: NOW,
    goal: "Inspect the visible page",
    profileId: "browser-assessment",
    status: "paused",
    policy: {
      maxRuntimeMs: 600_000,
      maxSteps: 40,
      maxReplay: 3,
      maxWorkflowRequests: 3,
      maxCaptureSample: 100,
      allowRawContext: false
    },
    checkpoint: {
      startUrl: "https://target.test",
      targetOrigin: "https://target.test",
      stepCount: 0,
      replayCount: 0,
      workflowRequestCount: 0,
      elapsedMs: 0,
      lastResumedAt: NOW,
      activeIdentity: "current",
      pendingCapabilityCall: { tool: "clickElement", input: { selector: "#review" } }
    },
    capabilities: {
      version: 1,
      revision: 1,
      leases: [{
        id: "lease-click",
        name: "Authorize visible click",
        riskTier: "active",
        tools: ["clickElement"],
        grants: [{
          origin: "https://target.test",
          method: "GET",
          pathPrefix: "/",
          identity: "current"
        }],
        durationMs: 120_000,
        maxUses: 1,
        maxRequests: 1,
        maxConcurrency: 1,
        maxPayloadBytes: 0,
        reason: "Inspect one operator-visible control.",
        status: "draft",
        createdAt: NOW,
        updatedAt: NOW,
        usedUses: 0,
        usedRequests: 0,
        scopeSnapshot: []
      }],
      receipts: []
    },
    timeline: [],
    findings: []
  };
}

describe("AgentCapabilityLedger", () => {
  it("defaults approvals to resume and preserves an explicit stay-paused choice", () => {
    const onUpdate = vi.fn();
    render(<AgentCapabilityLedger run={pausedRun()} onUpdate={onUpdate} />);

    const resume = screen.getByTestId("agentCapabilityResumeAfterApproval");
    expect(resume).toBeChecked();
    fireEvent.click(screen.getByTestId("capabilityGrantAll-lease-click"));
    expect(onUpdate).toHaveBeenLastCalledWith({
      action: "grant",
      approval: "all-matching",
      leaseId: "lease-click",
      resumeAfterApproval: true
    });

    fireEvent.click(resume);
    expect(resume).not.toBeChecked();
    fireEvent.click(screen.getByTestId("capabilityGrant-lease-click"));
    expect(onUpdate).toHaveBeenLastCalledWith({
      action: "grant",
      approval: "once",
      leaseId: "lease-click",
      resumeAfterApproval: false
    });
  });
});
