// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentRun } from "../types";
import { AgentThoughtstream } from "./AgentThoughtstream";

function activeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "agent-thoughtstream",
    sessionId: "session-test",
    createdAt: "2026-07-19T21:16:17.000Z",
    updatedAt: "2026-07-19T21:16:22.000Z",
    goal: "Inspect https://www.tylerstech.net/",
    profileId: "browser-assessment",
    status: "running",
    policy: {
      maxRuntimeMs: 300_000,
      maxSteps: 40,
      maxReplay: 3,
      maxWorkflowRequests: 3,
      maxCaptureSample: 100,
      allowRawContext: false
    },
    mission: {
      version: 1,
      revision: 11,
      goal: "Inspect https://www.tylerstech.net/",
      status: "active",
      createdAt: "2026-07-19T21:16:17.000Z",
      updatedAt: "2026-07-19T21:16:22.000Z",
      objectives: [
        {
          id: "obj-root",
          title: "Inspect the public site",
          description: "Map public evidence.",
          status: "active",
          priority: 1,
          createdAt: "2026-07-19T21:16:17.000Z",
          updatedAt: "2026-07-19T21:16:22.000Z"
        }
      ],
      hypotheses: [
        {
          id: "hyp-root",
          objectiveId: "obj-root",
          statement: "The public root may expose additional in-scope endpoints.",
          rationale: "Visible links can expand coverage.",
          status: "testing",
          priority: 3,
          pinned: false,
          evidenceRefs: [],
          createdAt: "2026-07-19T21:16:17.000Z",
          updatedAt: "2026-07-19T21:16:22.000Z"
        }
      ],
      experiments: [
        {
          id: "exp-dom",
          hypothesisId: "hyp-root",
          title: "Inspect the public root DOM",
          method: "Read the accessibility snapshot.",
          expectedObservation: "Stable same-origin links.",
          status: "running",
          evidenceRefs: [],
          createdAt: "2026-07-19T21:16:17.000Z",
          updatedAt: "2026-07-19T21:16:22.000Z"
        }
      ],
      claims: [],
      coverage: [],
      operatorQuestions: []
    },
    timeline: [
      {
        id: "decision-dom",
        createdAt: "2026-07-19T21:16:20.000Z",
        phase: "decision",
        summary: "Read the root accessibility structure before following links.",
        note: "Agent selected getDomSummary.",
        target: { browserUrl: "https://www.tylerstech.net/" },
        toolCall: { tool: "getDomSummary", input: {} }
      },
      {
        id: "call-dom",
        createdAt: "2026-07-19T21:16:21.000Z",
        phase: "tool-call",
        summary: "getDomSummary requested",
        toolCall: { tool: "getDomSummary", input: {} }
      },
      {
        id: "result-dom",
        createdAt: "2026-07-19T21:16:22.000Z",
        phase: "tool-result",
        summary: "getDomSummary completed",
        toolResult: {
          tool: "getDomSummary",
          ok: true,
          data: { url: "https://www.tylerstech.net/", title: "Tyler's Tech", text: "Home", ariaSnapshot: "", links: [], buttons: [], forms: [] }
        }
      }
    ],
    findings: [],
    ...overrides
  };
}

describe("AgentThoughtstream", () => {
  it("shows an empty live-decision surface before a run starts", () => {
    render(<AgentThoughtstream run={null} />);

    expect(screen.getByTestId("agentThoughtstream")).toBeInTheDocument();
    expect(screen.getByText(/Start an AI-First run/)).toBeInTheDocument();
  });

  it("shows the current mission focus, planner rationale, action target, and latest result", () => {
    render(<AgentThoughtstream run={activeRun()} />);

    expect(screen.getByText("Inspect the public root DOM")).toBeInTheDocument();
    expect(screen.getByTestId("agentThoughtstreamRationale")).toHaveTextContent(
      "Read the root accessibility structure before following links."
    );
    expect(screen.getByText("getDomSummary", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByTestId("agentThoughtstreamStepStatus")).toHaveTextContent("completed");
    expect(screen.getByText("https://www.tylerstech.net/")).toBeInTheDocument();
    expect(screen.getByText("getDomSummary completed successfully.")).toBeInTheDocument();
    expect(screen.getByText("Autonomous loop remains active")).toBeInTheDocument();
  });

  it("updates live content without remounting and flashing the thoughtstream body", () => {
    const completedTimeline = activeRun().timeline;
    const initial = activeRun({ timeline: completedTimeline.slice(0, 2) });
    const { rerender } = render(<AgentThoughtstream run={initial} />);
    const rationale = screen.getByTestId("agentThoughtstreamRationale");
    const status = screen.getByTestId("agentThoughtstreamStepStatus");

    expect(rationale).toHaveTextContent("Read the root accessibility structure before following links.");
    expect(status).toHaveTextContent("requested");

    rerender(<AgentThoughtstream run={activeRun({
      updatedAt: "2026-07-19T21:16:23.000Z",
      timeline: [
        ...completedTimeline,
        {
          id: "status-next",
          createdAt: "2026-07-19T21:16:23.000Z",
          phase: "status",
          summary: "Preparing the next bounded step."
        }
      ]
    })} />);

    expect(screen.getByTestId("agentThoughtstreamRationale")).toBe(rationale);
    expect(rationale).toHaveTextContent("Read the root accessibility structure before following links.");
    expect(screen.getByTestId("agentThoughtstreamStepStatus")).toBe(status);
    expect(status).toHaveTextContent("completed");
  });

  it("keeps the lease rationale stable while a gated tool moves from requested to completed", () => {
    const initial = activeRun({
      status: "paused",
      timeline: [
        {
          id: "lease-click",
          createdAt: "2026-07-19T21:16:20.000Z",
          phase: "policy-block",
          summary: "active lease proposed for clickElement",
          target: { control: "Saved-scope evidence surface" },
          toolCall: { tool: "clickElement", input: { selector: "role=link[name='Docs']" } }
        }
      ]
    });
    const { rerender } = render(<AgentThoughtstream run={initial} />);
    const rationale = screen.getByTestId("agentThoughtstreamRationale");

    expect(rationale).toHaveTextContent("active lease proposed for clickElement");
    expect(screen.getByTestId("agentThoughtstreamStepStatus")).toHaveTextContent("requested");

    rerender(<AgentThoughtstream run={activeRun({
      timeline: [
        ...initial.timeline,
        {
          id: "call-click",
          createdAt: "2026-07-19T21:16:21.000Z",
          phase: "tool-call",
          summary: "clickElement requested",
          actionId: "action-click",
          toolCall: { tool: "clickElement", input: { selector: "role=link[name='Docs']" } }
        },
        {
          id: "result-click",
          createdAt: "2026-07-19T21:16:22.000Z",
          phase: "tool-result",
          summary: "clickElement completed",
          actionId: "action-click",
          toolCall: { tool: "clickElement", input: { selector: "role=link[name='Docs']" } },
          toolResult: {
            tool: "clickElement",
            ok: true,
            data: {
              clicked: true,
              selector: "role=link[name='Docs']",
              url: "https://www.tylerstech.net/docs"
            }
          }
        }
      ]
    })} />);

    expect(screen.getByTestId("agentThoughtstreamRationale")).toBe(rationale);
    expect(rationale).toHaveTextContent("active lease proposed for clickElement");
    expect(screen.getByTestId("agentThoughtstreamStepStatus")).toHaveTextContent("completed");
  });

  it("keeps a newly blocked repeat call paired with its own rationale", () => {
    const prior = activeRun();
    render(<AgentThoughtstream run={activeRun({
      status: "paused",
      timeline: [
        ...prior.timeline,
        {
          id: "decision-dom-refresh",
          createdAt: "2026-07-19T21:16:23.000Z",
          phase: "decision",
          summary: "Refresh the DOM after navigation changed the visible page.",
          toolCall: { tool: "getDomSummary", input: {} }
        },
        {
          id: "blocked-dom-refresh",
          createdAt: "2026-07-19T21:16:24.000Z",
          phase: "policy-block",
          summary: "Policy blocked getDomSummary",
          toolCall: { tool: "getDomSummary", input: {} },
          toolResult: { tool: "getDomSummary", ok: false, error: "Tool budget exhausted." }
        }
      ]
    })} />);

    expect(screen.getByTestId("agentThoughtstreamRationale")).toHaveTextContent(
      "Refresh the DOM after navigation changed the visible page."
    );
    expect(screen.getByTestId("agentThoughtstreamStepStatus")).toHaveTextContent("failed");
  });

  it("labels Tutorial Mode pauses as lesson checkpoints", () => {
    const run = activeRun({
      status: "paused",
      policy: { ...activeRun().policy, tutorialMode: true }
    });
    render(<AgentThoughtstream run={run} />);

    expect(screen.getByText("Lesson checkpoint")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Continue Lesson")).toBeInTheDocument();
  });
});
