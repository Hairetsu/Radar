// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const baseProps = {
  open: true,
  view: "traffic" as const,
  onClose: vi.fn(),
  captureIds: ["cap-1"],
  captures: [
    {
      id: "cap-1",
      startedAt: new Date().toISOString(),
      method: "GET",
      url: "http://localhost:3000",
      host: "localhost:3000",
      path: "/",
      requestHeaders: {},
      requestBody: "",
      status: 200,
      statusText: "OK",
      mimeType: "text/html",
      type: "Document",
      responseHeaders: {},
      responseBody: "",
      durationMs: 12,
      allowed: true,
      source: "browser" as const
    }
  ],
  targets: ["http://localhost:*"],
  browserUrl: "http://localhost:3000",
  draft: {
    method: "GET",
    url: "http://localhost:3000",
    headers: {},
    body: ""
  },
  lastResponse: null,
  sslEvents: [],
  proxyRunning: false,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  onApplyDraft: vi.fn(),
  onPrepareNavigate: vi.fn(),
  onNotice: vi.fn(),
  canRun: false,
  onOpenSettings: vi.fn()
};

describe("CommandPalette", () => {
  it("lists traffic tasks when open", async () => {
    render(<CommandPalette {...baseProps} />);
    expect(await screen.findByText("Capture Summary")).toBeInTheDocument();
    expect(screen.getByText("Report Notes")).toBeInTheDocument();
    expect(screen.queryByText("Repeater Drafts")).not.toBeInTheDocument();
  });

  it("lists scope tasks for scope view", async () => {
    render(<CommandPalette {...baseProps} view="scope" captureIds={[]} />);
    expect(await screen.findByText("Scope Checklist")).toBeInTheDocument();
    expect(screen.getByText("Browser Helper")).toBeInTheDocument();
  });

  it("moves to preview after selecting a task", async () => {
    const user = userEvent.setup();
    render(<CommandPalette {...baseProps} />);

    await user.click(await screen.findByText("Capture Summary"));
    await user.click(screen.getByRole("button", { name: /Preview context/i }));
    expect(await screen.findByText(/Context preview/i)).toBeInTheDocument();
  });
});
