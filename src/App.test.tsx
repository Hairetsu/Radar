// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CapturedRequest } from "./types";

const capture = (id: string, url: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest => {
  const parsed = new URL(url);
  return {
    id,
    startedAt: "2026-05-25T00:00:00.000Z",
    method: "GET",
    url,
    host: parsed.host,
    path: parsed.pathname,
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: {},
    responseBody: "",
    durationMs: 12,
    allowed: false,
    source: "browser",
    ...overrides
  };
};

afterEach(() => {
  window.localStorage.clear();
  vi.mocked(window.radar!.getCaptures).mockResolvedValue([]);
  vi.mocked(window.radar!.getTargets).mockResolvedValue([]);
  vi.mocked(window.radar!.setTargets).mockClear();
  vi.mocked(window.radar!.setTargets).mockResolvedValue(undefined as unknown as string[]);
  vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([]);
  vi.mocked(window.radar!.listLocalSessions).mockResolvedValue([
    {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      captureCount: 0,
      sslEventCount: 0
    }
  ]);
});

describe("App", () => {
  it("renders the workbench shell", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open browser/i })).toBeInTheDocument();
    expect(screen.queryByTestId("markTarget")).not.toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectionIndicator")).toBeInTheDocument();
    expect(screen.getByTestId("openProfileSessionPanel")).toBeInTheDocument();
  });

  it("switches to AI-First and starts an agent run from a goal", async () => {
    const startAgentRun = vi.mocked(window.radar!.startAgentRun);
    const setTargets = vi.mocked(window.radar!.setTargets);
    startAgentRun.mockClear();
    setTargets.mockClear();
    setTargets.mockImplementation(async (nextTargets) => nextTargets);
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["http://localhost:*"]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("aiFirstMode"));
    expect(screen.getByTestId("aiFirstConsole")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("agentGoalInput"), { target: { value: "Inspect hairetsu.com for auth hardening" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => {
      expect(setTargets).toHaveBeenCalledWith(["http://localhost:*", "https://hairetsu.com"]);
      expect(startAgentRun).toHaveBeenCalledWith({
        goal: "Inspect hairetsu.com for auth hardening",
        startUrl: "https://hairetsu.com"
      });
    });
  });

  it("follows agent view changes while AI-First is active", async () => {
    window.localStorage.setItem("radar.appMode", "ai-first");
    vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([
      {
        id: "agent-view",
        sessionId: "session-test",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:01.000Z",
        goal: "Drive the app",
        status: "running",
        policy: {
          maxRuntimeMs: 120000,
          maxSteps: 8,
          maxReplay: 1,
          maxCaptureSample: 20,
          allowRawContext: false
        },
        timeline: [
          {
            id: "step-repeater",
            createdAt: "2026-05-25T00:00:01.000Z",
            note: "Agent is moving to Repeater.",
            toolCall: { tool: "showView", input: { view: "repeater", reason: "Replay inspection" } }
          }
        ],
        findings: []
      }
    ]);

    render(<App />);

    expect(await screen.findByTestId("aiFirstConsole")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Repeater" })).toBeInTheDocument();
    });
  });

  it("saves active profile and session names from the profile session panel", async () => {
    const saveProfile = vi.mocked(window.radar!.saveLocalProfile);
    const saveSession = vi.mocked(window.radar!.saveLocalSession);
    saveProfile.mockClear();
    saveSession.mockClear();

    render(<App />);

    fireEvent.click(await screen.findByTestId("openProfileSessionPanel"));
    expect(await screen.findByTestId("profileSessionPanel")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("profileNameInput"), { target: { value: "Client Alpha" } });
    fireEvent.click(screen.getByTestId("saveProfile"));

    await waitFor(() => {
      expect(saveProfile).toHaveBeenCalledWith({ id: "profile-test", name: "Client Alpha" });
    });

    fireEvent.change(screen.getByTestId("sessionNameInput"), { target: { value: "Retest 01" } });
    fireEvent.click(screen.getByTestId("saveSession"));

    await waitFor(() => {
      expect(saveSession).toHaveBeenCalledWith({ id: "session-test", name: "Retest 01" });
    });
  });

  it("names a new traffic session before creating it", async () => {
    const createSession = vi.mocked(window.radar!.createLocalSession);
    createSession.mockClear();

    render(<App />);

    fireEvent.click(await screen.findByTestId("createLocalSession"));
    expect(await screen.findByTestId("newSessionDialog")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("newSessionNameInput"), { target: { value: "Checkout retest" } });
    fireEvent.click(screen.getByTestId("confirmNewSession"));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith("Checkout retest");
    });
  });

  it("loads sessions from the main nav selector", async () => {
    vi.mocked(window.radar!.listLocalSessions).mockResolvedValue([
      {
        id: "session-test",
        workspaceId: "workspace-test",
        name: "Baseline",
        startedAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        captureCount: 0,
        sslEventCount: 0
      },
      {
        id: "session-archive",
        workspaceId: "workspace-test",
        name: "Archive",
        startedAt: "2026-05-25T00:01:00.000Z",
        updatedAt: "2026-05-25T00:01:00.000Z",
        captureCount: 2,
        sslEventCount: 1
      }
    ]);
    vi.mocked(window.radar!.loadLocalSession).mockResolvedValue({
      profile: {
        id: "profile-test",
        name: "Local Operator",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      },
      workspace: {
        id: "workspace-test",
        profileId: "profile-test",
        name: "Default Workspace",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      },
      session: {
        id: "session-archive",
        workspaceId: "workspace-test",
        name: "Archive",
        startedAt: "2026-05-25T00:01:00.000Z",
        updatedAt: "2026-05-25T00:01:00.000Z"
      }
    });

    render(<App />);

    expect(await screen.findByText("Archive - 2 req")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("sessionSelector"), { target: { value: "session-archive" } });

    await waitFor(() => {
      expect(window.radar!.loadLocalSession).toHaveBeenCalledWith("session-archive");
    });
  });

  it("filters the traffic list to current scope", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("allowed", "https://allowed.test/path"),
      capture("blocked", "https://blocked.test/path")
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-blocked")).not.toBeInTheDocument();
  });

  it("keeps traffic detail text selectable and copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("allowed", "https://allowed.test/path")]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
    expect(screen.getByTestId("trafficDetailText")).toHaveClass("select-text");

    fireEvent.click(screen.getByTestId("copyTrafficDetail"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("GET https://allowed.test/path"));
  });

  it("opens a request context menu and copies export snippets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("allowed", "https://allowed.test/api", {
        method: "POST",
        requestHeaders: { Accept: "application/json" },
        requestBody: "{\"probe\":true}"
      })
    ]);

    render(<App />);

    fireEvent.contextMenu(await screen.findByTestId("trafficRow-allowed"), { clientX: 120, clientY: 140 });
    expect(screen.getByTestId("requestContextMenu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("requestMenuCopyCurl"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("curl -i"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--data-raw '{\"probe\":true}'"));
  });

  it("adds a request origin to scope and deletes captures from the context menu", async () => {
    const setTargets = vi.mocked(window.radar!.setTargets);
    const deleteCapture = vi.mocked(window.radar!.deleteCapture);
    setTargets.mockClear();
    deleteCapture.mockClear();
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://*.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("new", "https://new.test/api")]);

    render(<App />);

    fireEvent.contextMenu(await screen.findByTestId("trafficRow-new"), { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByTestId("requestMenuAddScope"));

    await waitFor(() => {
      expect(setTargets).toHaveBeenCalledWith(["https://*.test", "https://new.test"]);
    });

    fireEvent.contextMenu(screen.getByTestId("trafficRow-new"), { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByTestId("requestMenuDelete"));

    await waitFor(() => {
      expect(deleteCapture).toHaveBeenCalledWith("new");
      expect(screen.queryByTestId("trafficRow-new")).not.toBeInTheDocument();
    });
  });

  it("filters traffic by method and resource type", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("fetch", "https://allowed.test/api", { method: "POST", type: "Fetch" }),
      capture("document", "https://allowed.test/page", { method: "GET", type: "Document" })
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-fetch")).toBeInTheDocument();
    expect(screen.getByTestId("trafficRow-document")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficMethodFilter"), { target: { value: "POST" } });
    expect(screen.getByTestId("trafficRow-fetch")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-document")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficTypeFilter"), { target: { value: "Document" } });
    expect(screen.queryByTestId("trafficRow-fetch")).not.toBeInTheDocument();
    expect(screen.getByText("No captures match filters")).toBeInTheDocument();
  });

  it("multi-selects traffic rows for the ai palette", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("one", "https://allowed.test/one", { startedAt: "2026-05-25T00:00:01.000Z" }),
      capture("two", "https://allowed.test/two", { startedAt: "2026-05-25T00:00:02.000Z" }),
      capture("three", "https://allowed.test/three", { startedAt: "2026-05-25T00:00:03.000Z" })
    ]);

    render(<App />);

    const rowOne = await screen.findByTestId("trafficRow-one");
    const rowTwo = screen.getByTestId("trafficRow-two");
    const rowThree = screen.getByTestId("trafficRow-three");

    fireEvent.click(rowOne);
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "false");

    fireEvent.click(rowTwo, { metaKey: true });
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "true");

    fireEvent.click(rowThree, { shiftKey: true });
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "true");
    expect(rowThree).toHaveAttribute("data-selected", "true");
  });

  it("sorts traffic by selected field and direction", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://*.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("b", "https://alpha.test/z", {
        startedAt: "2026-05-25T00:00:02.000Z",
        host: "alpha.test",
        path: "/z",
        durationMs: 50
      }),
      capture("a", "https://beta.test/a", {
        startedAt: "2026-05-25T00:00:01.000Z",
        host: "beta.test",
        path: "/a",
        durationMs: 10
      })
    ]);

    render(<App />);

    await screen.findByTestId("trafficRow-b");

    const rowOrder = () =>
      screen.getAllByTestId(/^trafficRow-/).map((row) => row.getAttribute("data-testid")?.replace("trafficRow-", ""));

    expect(rowOrder()).toEqual(["b", "a"]);

    fireEvent.change(screen.getByTestId("trafficSortField"), { target: { value: "host" } });
    expect(rowOrder()).toEqual(["a", "b"]);

    fireEvent.click(screen.getByTestId("trafficSortDirection"));
    expect(rowOrder()).toEqual(["b", "a"]);

    fireEvent.change(screen.getByTestId("trafficSortField"), { target: { value: "duration" } });
    expect(rowOrder()).toEqual(["a", "b"]);
  });

  it("searches traffic across request and response details", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("match", "https://allowed.test/api", {
        requestHeaders: { "X-Probe": "request-needle" },
        responseBody: "response-needle"
      }),
      capture("miss", "https://allowed.test/page", { responseBody: "ordinary body" })
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.getByTestId("trafficRow-miss")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficSearch"), { target: { value: "response-needle" } });
    expect(screen.getByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-miss")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficSearch"), { target: { value: "request-needle" } });
    expect(screen.getByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-miss")).not.toBeInTheDocument();
  });
});
