// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CapturedRequest } from "./types";

const capture = (id: string, url: string): CapturedRequest => {
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
    source: "browser"
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
    expect(screen.getByPlaceholderText("https://")).toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
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
});
