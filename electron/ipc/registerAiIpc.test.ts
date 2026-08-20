import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerAiIpc } from "./registerAiIpc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

describe("registerAiIpc", () => {
  it("blocks settings mutation before calling the provider operation", () => {
    const handlers = new Map<string, Handler>();
    const saveSettings = vi.fn(() => ({}));
    const getSettings = vi.fn(() => ({}));
    registerAiIpc({ handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain, {
      authorize: (_senderId, action) => action !== "settings-write",
      getSettings,
      saveSettings,
      previewContext: vi.fn(() => ({})),
      run: vi.fn(async () => ({})),
      getSkills: vi.fn(() => []),
      saveSkill: vi.fn(() => []),
      deleteSkill: vi.fn(() => []),
      snapshotAudit: vi.fn(() => []),
      connect: vi.fn(async () => ({})),
      probe: vi.fn(async () => ({})),
      cursorLogin: vi.fn(async () => ({})),
      getModels: vi.fn(() => []),
      refreshModels: vi.fn(async () => [])
    });
    const event = { sender: { id: 7 } } as unknown as IpcMainInvokeEvent;

    expect(() => handlers.get("ai:settings:set")!(event, {})).toThrow("not authorized");
    expect(saveSettings).not.toHaveBeenCalled();
    expect(handlers.get("ai:settings:get")!(event)).toEqual({});
    expect(handlers.get("ai:settings:get")!(event, "xai")).toEqual({});
    expect(getSettings).toHaveBeenLastCalledWith("xai");
    expect(() => handlers.get("ai:settings:get")!(event, "unknown")).toThrow("Unknown AI provider");
  });
});
