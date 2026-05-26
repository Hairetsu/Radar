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
  vi.mocked(window.radar!.getCaptures).mockResolvedValue([]);
  vi.mocked(window.radar!.getTargets).mockResolvedValue([]);
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
