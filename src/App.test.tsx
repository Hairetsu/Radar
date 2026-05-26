// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
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
});

describe("App", () => {
  it("renders the workbench shell", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open browser/i })).toBeInTheDocument();
    expect(screen.queryByTestId("markTarget")).not.toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectionIndicator")).toBeInTheDocument();
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
