import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerAgentIpc } from "./registerAgentIpc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function registrar() {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler)
  } as unknown as IpcMain;
  return { ipcMain, handlers };
}

function event(senderId: number) {
  return { sender: { id: senderId } } as unknown as IpcMainInvokeEvent;
}

describe("registerAgentIpc", () => {
  it("checks the registered sender role before invoking agent mutations", async () => {
    const { ipcMain, handlers } = registrar();
    const start = vi.fn(() => ({ id: "run-1" }));
    registerAgentIpc(ipcMain, {
      authorize: (_senderId, action) => action !== "start",
      start: start as never,
      pause: vi.fn(() => null),
      resume: vi.fn(() => null),
      recover: vi.fn(() => null),
      steerMission: vi.fn(() => null),
      updateCapabilities: vi.fn(() => null),
      stop: vi.fn(() => null),
      get: vi.fn(() => null),
      list: vi.fn(() => []),
      listMemory: vi.fn(() => []),
      saveMemory: vi.fn((entry) => entry),
      deleteMemory: vi.fn(() => [])
    });

    expect(() => handlers.get("agent:start")!(event(9), {})).toThrow("not authorized");
    expect(start).not.toHaveBeenCalled();
    expect(handlers.get("agent:list")!(event(9))).toEqual([]);
  });
});
