// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { DEFAULT_AI_SETTINGS } from "./types";

const baseProps = {
  open: true,
  onClose: vi.fn(),
  settings: DEFAULT_AI_SETTINGS,
  onSettingsChange: vi.fn(),
  connected: false,
  checking: false,
  message: "Not connected",
  error: "",
  onSave: vi.fn(),
  onProbe: vi.fn(),
  onConnectPreset: vi.fn(),
  onCursorLogin: vi.fn(),
  models: [{ id: "auto", label: "auto" }],
  modelsLoading: false,
  saving: false,
  probing: false,
  connecting: false,
  cursorLoggingIn: false
};

describe("AiSettingsPanel", () => {
  it("shows connection settings outside the command palette", async () => {
    render(<AiSettingsPanel {...baseProps} />);
    expect(await screen.findByText("Connection")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectCodex")).toBeInTheDocument();
    expect(screen.getByTestId("aiProvider")).toBeInTheDocument();
    expect(screen.queryByText("Command Palette")).not.toBeInTheDocument();
  });

  it("shows connected status", async () => {
    render(<AiSettingsPanel {...baseProps} connected message="Ready" />);
    expect(await screen.findByTestId("aiConnectionStatus")).toHaveTextContent("Connected");
  });

  it("shows cursor sign in control", async () => {
    render(
      <AiSettingsPanel
        {...baseProps}
        settings={{ ...DEFAULT_AI_SETTINGS, provider: "cursor-local", baseUrl: "cursor://local", apiKey: "local" }}
      />
    );
    expect(await screen.findByTestId("aiCursorLogin")).toBeInTheDocument();
  });

  it("calls cursor login handler", async () => {
    const onCursorLogin = vi.fn();
    const user = userEvent.setup();
    render(
      <AiSettingsPanel
        {...baseProps}
        onCursorLogin={onCursorLogin}
        settings={{ ...DEFAULT_AI_SETTINGS, provider: "cursor-local", baseUrl: "cursor://local", apiKey: "local" }}
      />
    );
    await user.click(screen.getByTestId("aiCursorLogin"));
    expect(onCursorLogin).toHaveBeenCalled();
  });

  it("calls save handler", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AiSettingsPanel {...baseProps} onSave={onSave} />);
    await user.click(screen.getByTestId("aiSaveSettings"));
    expect(onSave).toHaveBeenCalled();
  });
});
