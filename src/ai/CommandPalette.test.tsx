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
  webSocketEventIds: [],
  webSocketEvents: [],
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
    render(<CommandPalette {...baseProps} view="scope" captureIds={[]} webSocketEventIds={[]} />);
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

  it("supports multi-selecting captures for traffic tasks", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        {...baseProps}
        captureIds={["cap-1"]}
        captures={[
          baseProps.captures[0],
          {
            ...baseProps.captures[0],
            id: "cap-2",
            path: "/api",
            url: "http://localhost:3000/api"
          }
        ]}
      />
    );

    expect(await screen.findByText("Packets (1/2)")).toBeInTheDocument();
    expect(screen.getByTestId("aiCaptureCheckbox-cap-1")).toBeChecked();
    expect(screen.getByTestId("aiCaptureCheckbox-cap-2")).not.toBeChecked();

    await user.click(screen.getByTestId("aiCaptureCheckbox-cap-2"));
    expect(screen.getByText("Packets (2/2)")).toBeInTheDocument();
    expect(screen.getByText("2 packets selected")).toBeInTheDocument();

    await user.click(screen.getByTestId("aiClearPackets"));
    expect(screen.getByText("Packets (0/2)")).toBeInTheDocument();
    expect(screen.getByText("No packets selected")).toBeInTheDocument();

    await user.click(screen.getByTestId("aiSelectAllPackets"));
    expect(screen.getByText("Packets (2/2)")).toBeInTheDocument();
  });

  it("supports selecting websocket packets for websocket tasks", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        {...baseProps}
        view="websocket"
        captureIds={[]}
        webSocketEventIds={["ws-1"]}
        webSocketEvents={[
          {
            id: "ws-1",
            requestId: "stream-1",
            createdAt: new Date().toISOString(),
            url: "wss://localhost:3000/socket",
            host: "localhost:3000",
            direction: "received",
            opcode: 1,
            payloadData: "{\"event\":\"ready\"}",
            size: 17,
            requestHeaders: {},
            responseHeaders: {},
            allowed: true
          },
          {
            id: "ws-2",
            requestId: "stream-1",
            createdAt: new Date().toISOString(),
            url: "wss://localhost:3000/socket",
            host: "localhost:3000",
            direction: "sent",
            opcode: 1,
            payloadData: "{\"event\":\"ack\"}",
            size: 15,
            requestHeaders: {},
            responseHeaders: {},
            allowed: true
          }
        ]}
      />
    );

    expect(await screen.findByText("Packets (1/3)")).toBeInTheDocument();
    expect(screen.getByTestId("aiWebSocketCheckbox-ws-1")).toBeChecked();
    expect(screen.getByTestId("aiWebSocketCheckbox-ws-2")).not.toBeChecked();

    await user.click(screen.getByTestId("aiWebSocketCheckbox-ws-2"));
    expect(screen.getByText("Packets (2/3)")).toBeInTheDocument();

    await user.click(screen.getByTestId("aiSelectAllPackets"));
    expect(screen.getByText("Packets (3/3)")).toBeInTheDocument();
  });
});
