// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CapturedRequest, WebSocketEvent } from "./types";

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
  vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
    config: { requestEnabled: false, responseEnabled: false },
    queue: []
  });
  vi.mocked(window.radar!.setInterceptConfig).mockClear();
  vi.mocked(window.radar!.setInterceptConfig).mockImplementation(async (config) => ({
    config: {
      requestEnabled: typeof config.requestEnabled === "boolean" ? config.requestEnabled : false,
      responseEnabled: typeof config.responseEnabled === "boolean" ? config.responseEnabled : false
    },
    queue: []
  }));
  vi.mocked(window.radar!.forwardIntercept).mockClear();
  vi.mocked(window.radar!.dropIntercept).mockClear();
  vi.mocked(window.radar!.resumeAllIntercepts).mockClear();
  vi.mocked(window.radar!.getInterceptRules).mockResolvedValue([]);
  vi.mocked(window.radar!.setInterceptRules).mockClear();
  vi.mocked(window.radar!.setInterceptRules).mockImplementation(async (rules) => rules);
  vi.mocked(window.radar!.getMatchReplaceRules).mockResolvedValue([]);
  vi.mocked(window.radar!.setMatchReplaceRules).mockClear();
  vi.mocked(window.radar!.setMatchReplaceRules).mockImplementation(async (rules) => rules);
  vi.mocked(window.radar!.getProxyProfiles).mockResolvedValue([]);
  vi.mocked(window.radar!.saveProxyProfile).mockClear();
  vi.mocked(window.radar!.saveProxyProfile).mockResolvedValue([]);
  vi.mocked(window.radar!.getTargets).mockResolvedValue([]);
  vi.mocked(window.radar!.setTargets).mockClear();
  vi.mocked(window.radar!.setTargets).mockResolvedValue(undefined as unknown as string[]);
  vi.mocked(window.radar!.getWebSocketEvents).mockResolvedValue([]);
  vi.mocked(window.radar!.getAutomatePayloadSets).mockResolvedValue([]);
  vi.mocked(window.radar!.setAutomatePayloadSets).mockClear();
  vi.mocked(window.radar!.listAutomateSessions).mockResolvedValue([]);
  vi.mocked(window.radar!.startAutomateSession).mockClear();
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
    expect(await screen.findByRole("heading", { name: "HTTP / HTTPS Traffic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open browser/i })).toBeInTheDocument();
    expect(screen.queryByTestId("markTarget")).not.toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectionIndicator")).toBeInTheDocument();
    expect(screen.getByTestId("openProfileSessionPanel")).toBeInTheDocument();
  });

  it("marks automate payload positions and loads a materialized preview into repeater", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId("view-automate"));
    expect(await screen.findByRole("heading", { name: "Automate" })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("automateMarkerName"), { target: { value: "id" } });
    fireEvent.change(screen.getByTestId("automatePayloads"), { target: { value: "42\n43" } });
    fireEvent.click(screen.getByTestId("markAutomateUrl"));

    await waitFor(() => {
      expect(screen.getByTestId("automatePreview")).toHaveTextContent("id=42");
    });

    fireEvent.click(screen.getByTestId("loadAutomatePreviewInline"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Repeater" })).toBeInTheDocument();
      expect((screen.getByTestId("repeaterUrl") as HTMLInputElement).value).toContain("id=42");
    });
  });

  it("starts bounded automate sessions from visible controls", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId("view-automate"));
    fireEvent.change(screen.getByTestId("automateMarkerName"), { target: { value: "id" } });
    fireEvent.change(screen.getByTestId("automatePayloads"), { target: { value: "42\n43" } });
    fireEvent.click(screen.getByTestId("markAutomateUrl"));
    await waitFor(() => {
      expect(screen.getByTestId("automatePreview")).toHaveTextContent("id=42");
    });
    fireEvent.click(screen.getByTestId("startAutomateSession"));

    await waitFor(() => {
      expect(window.radar!.startAutomateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payloads: ["42", "43"],
          limits: expect.objectContaining({ count: 10, concurrency: 1 })
        })
      );
    });
  });

  it("hydrates profiles and http captures when websocket ipc is unavailable", async () => {
    const originalWebSocketSnapshot = window.radar!.getWebSocketEvents;
    const legacyRadar = window.radar as unknown as { getWebSocketEvents?: unknown };
    try {
      legacyRadar.getWebSocketEvents = undefined;
      vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
      vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("allowed", "https://allowed.test/path")]);

      render(<App />);

      expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("openProfileSessionPanel"));
      expect(await screen.findByTestId("profileSessionPanel")).toBeInTheDocument();
    } finally {
      legacyRadar.getWebSocketEvents = originalWebSocketSnapshot;
    }
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

  it("shows websocket frames in the websocket analyzer tab", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    const frame: WebSocketEvent = {
      id: "ws-frame-1",
      requestId: "request-ws-1",
      createdAt: "2026-05-25T00:00:00.000Z",
      url: "wss://allowed.test/socket",
      host: "allowed.test",
      direction: "received",
      opcode: 1,
      payloadData: "{\"type\":\"ready\"}",
      size: 16,
      responseHeaders: { Upgrade: "websocket" },
      requestHeaders: { Connection: "Upgrade" },
      allowed: true
    };
    vi.mocked(window.radar!.getWebSocketEvents).mockResolvedValue([frame]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-websocket"));

    expect(await screen.findByRole("heading", { name: "WebSocket" })).toBeInTheDocument();
    expect(screen.getByTestId("webSocketRow-ws-frame-1")).toBeInTheDocument();
    expect(screen.getByTestId("webSocketDetailText")).toHaveTextContent("wss://allowed.test/socket");

    fireEvent.change(screen.getByTestId("webSocketDirectionFilter"), { target: { value: "sent" } });
    expect(screen.queryByTestId("webSocketRow-ws-frame-1")).not.toBeInTheDocument();
    expect(screen.getByText("No WebSocket frames match filters")).toBeInTheDocument();
  });

  it("queues and edits scoped requests in the intercept view", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
      config: { requestEnabled: true, responseEnabled: false },
      queue: [
        {
          id: "intercept-1",
          captureId: "cap-intercept-1",
          stage: "request",
          queuedAt: "2026-05-25T00:00:00.000Z",
          method: "POST",
          url: "https://allowed.test/login",
          host: "allowed.test",
          path: "/login",
          headers: { "Content-Type": "application/json" },
          body: "{\"role\":\"user\"}",
          allowed: true,
          source: "proxy",
          note: "Paused before upstream"
        }
      ]
    });

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect(await screen.findByRole("heading", { name: "Intercept" })).toBeInTheDocument();
    expect(screen.getByTestId("interceptRow-intercept-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("interceptBody")).toHaveValue("{\"role\":\"user\"}");

    fireEvent.change(screen.getByTestId("interceptBody"), { target: { value: "{\"role\":\"admin\"}" } });
    fireEvent.click(screen.getByTestId("forwardIntercept"));

    await waitFor(() => {
      expect(window.radar!.forwardIntercept).toHaveBeenCalledWith({
        id: "intercept-1",
        draft: {
          method: "POST",
          url: "https://allowed.test/login",
          headers: { "Content-Type": "application/json" },
          body: "{\"role\":\"admin\"}"
        }
      });
    });
  });

  it("queues and edits scoped responses in the intercept view", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
      config: { requestEnabled: false, responseEnabled: true },
      queue: [
        {
          id: "intercept-response-1",
          captureId: "cap-intercept-response-1",
          stage: "response",
          queuedAt: "2026-05-25T00:00:00.000Z",
          method: "POST",
          url: "https://allowed.test/login",
          host: "allowed.test",
          path: "/login",
          headers: { "content-type": "application/json" },
          body: "{\"ok\":true}",
          allowed: true,
          source: "proxy",
          note: "Paused before client",
          status: 200,
          statusText: "OK"
        }
      ]
    });

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect(await screen.findByTestId("interceptRow-intercept-response-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("interceptStatus")).toHaveValue(200);

    fireEvent.change(screen.getByTestId("interceptStatus"), { target: { value: "401" } });
    fireEvent.change(screen.getByTestId("interceptStatusText"), { target: { value: "Unauthorized" } });
    fireEvent.click(screen.getByTestId("forwardIntercept"));

    await waitFor(() => {
      expect(window.radar!.forwardIntercept).toHaveBeenCalledWith({
        id: "intercept-response-1",
        response: {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
          body: "{\"ok\":true}"
        }
      });
    });
  });

  it("saves intercept rules from the intercept view", async () => {
    vi.mocked(window.radar!.getInterceptRules).mockResolvedValue([
      {
        id: "rule-login",
        name: "Login JSON",
        enabled: true,
        stage: "request",
        method: "POST",
        path: "/login",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect((await screen.findByTestId("interceptRulesText") as HTMLTextAreaElement).value).toContain("Login JSON");

    fireEvent.change(screen.getByTestId("interceptRulesText"), {
      target: {
        value: JSON.stringify([
          {
            id: "rule-admin",
            name: "Admin responses",
            enabled: true,
            stage: "response",
            status: 403,
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ])
      }
    });
    fireEvent.click(screen.getByTestId("saveInterceptRules"));

    await waitFor(() => {
      expect(window.radar!.setInterceptRules).toHaveBeenCalledWith([
        expect.objectContaining({ id: "rule-admin", name: "Admin responses", stage: "response", status: 403 })
      ]);
    });
  });

  it("saves match and replace rules from the intercept view", async () => {
    vi.mocked(window.radar!.getMatchReplaceRules).mockResolvedValue([
      {
        id: "rewrite-role",
        name: "Promote Role",
        enabled: true,
        stage: "response",
        target: "body",
        match: "\"user\"",
        replace: "\"admin\"",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect((await screen.findByTestId("matchReplaceRulesText") as HTMLTextAreaElement).value).toContain("Promote Role");

    fireEvent.change(screen.getByTestId("matchReplaceRulesText"), {
      target: {
        value: JSON.stringify([
          {
            id: "rewrite-token",
            name: "Swap Token",
            enabled: true,
            stage: "request",
            target: "header",
            headerName: "authorization",
            match: "old-token",
            replace: "new-token",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ])
      }
    });
    fireEvent.click(screen.getByTestId("saveMatchReplaceRules"));

    await waitFor(() => {
      expect(window.radar!.setMatchReplaceRules).toHaveBeenCalledWith([
        expect.objectContaining({ id: "rewrite-token", name: "Swap Token", target: "header" })
      ]);
    });
  });

  it("saves proxy profile notes from the SSL view", async () => {
    vi.mocked(window.radar!.getProxyProfiles).mockResolvedValue([
      {
        id: "radar-browser",
        label: "Radar Browser",
        hint: "Use Open Browser.",
        notes: "",
        updatedAt: ""
      },
      {
        id: "cli",
        label: "CLI Tools",
        hint: "Export proxy variables.",
        notes: "old note",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);
    vi.mocked(window.radar!.saveProxyProfile).mockResolvedValue([
      {
        id: "cli",
        label: "CLI Tools",
        hint: "Export proxy variables.",
        notes: "export HTTPS_PROXY=http://127.0.0.1:8088",
        updatedAt: "2026-05-25T00:01:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-ssl"));
    fireEvent.click(await screen.findByTestId("proxyProfile-cli"));
    expect(screen.getByTestId("proxyProfileNotes")).toHaveValue("old note");

    fireEvent.change(screen.getByTestId("proxyProfileNotes"), {
      target: { value: "export HTTPS_PROXY=http://127.0.0.1:8088" }
    });
    fireEvent.click(screen.getByTestId("saveProxyProfile"));

    await waitFor(() => {
      expect(window.radar!.saveProxyProfile).toHaveBeenCalledWith({
        id: "cli",
        notes: "export HTTPS_PROXY=http://127.0.0.1:8088"
      });
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
