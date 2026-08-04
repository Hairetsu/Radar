import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { WINDOW_CHANNELS } from "../../shared/windowCoordination.js";
import type { WindowCoordinator } from "../windows/windowCoordinator.js";
import { registerWindowIpc } from "./registerWindowIpc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function event(senderId: number) {
  return { sender: { id: senderId } } as unknown as IpcMainInvokeEvent;
}

function setup({ pauseResult = { status: "paused" } }: { pauseResult?: { status: string } | null } = {}) {
  const handlers = new Map<string, Handler>();
  const setAppMode = vi.fn((mode) => mode);
  const forwardWorkspaceIntent = vi.fn(() => true);
  const coordinator = {
    roleForWebContents: (id: number) => id === 1 ? "workspace" : id === 2 ? "ai-operator" : null,
    showAiOperator: vi.fn(() => ({ created: true, visible: true, focused: true, section: "runs" })),
    state: vi.fn(() => ({ created: false, visible: false, focused: false, section: "runs" })),
    appMode: vi.fn(() => "ai-first"),
    setAppMode,
    publishWorkspaceContext: vi.fn((context) => context),
    workspaceContext: vi.fn(() => null),
    forwardWorkspaceIntent,
    focusWorkspace: vi.fn(() => true)
  } as unknown as WindowCoordinator;
  registerWindowIpc({ handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain, {
    coordinator: () => coordinator,
    executingRun: () => ({ id: "run-active" }) as never,
    pauseRun: vi.fn(async () => pauseResult as never)
  });
  return { handlers, setAppMode, forwardWorkspaceIntent };
}

describe("registerWindowIpc", () => {
  it("enforces sender roles and rejects unknown workspace intents", async () => {
    const { handlers, forwardWorkspaceIntent } = setup();
    expect(() => handlers.get(WINDOW_CHANNELS.getWorkspaceContext)!(event(1))).toThrow("not authorized");
    expect(handlers.get(WINDOW_CHANNELS.dispatchWorkspaceIntent)!(event(2), { type: "execute-javascript" })).toEqual({
      ok: false,
      error: "Workspace control intent was invalid."
    });
    expect(forwardWorkspaceIntent).not.toHaveBeenCalled();
  });

  it("pauses durably before allowing Manual-First", async () => {
    const success = setup();
    await expect(success.handlers.get(WINDOW_CHANNELS.setAppMode)!(event(2), "manual-first")).resolves.toBe("manual-first");
    expect(success.setAppMode).toHaveBeenCalledWith("manual-first");

    const failure = setup({ pauseResult: null });
    await expect(failure.handlers.get(WINDOW_CHANNELS.setAppMode)!(event(2), "manual-first")).rejects.toThrow("could not checkpoint");
    expect(failure.setAppMode).not.toHaveBeenCalled();
  });
});
