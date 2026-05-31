import { describe, expect, it } from "vitest";
import { appendReplayHistory, createReplayTab, defaultReplayTabState, normalizeReplayTab, normalizeReplayTabState, updateActiveTabDraft } from "./replayTabs.js";

describe("replayTabs", () => {
  it("creates a default tab state", () => {
    const state = defaultReplayTabState("2026-01-01T00:00:00.000Z");
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it("normalizes invalid state to default", () => {
    expect(normalizeReplayTabState(null).tabs.length).toBeGreaterThan(0);
  });

  it("appends capped history per tab", () => {
    let tab = createReplayTab("Auth", { method: "GET", url: "https://example.test", headers: {}, body: "" }, "2026-01-01T00:00:00.000Z");
    for (let index = 0; index < 55; index += 1) {
      tab = appendReplayHistory(
        tab,
        tab.draft,
        {
          ok: true,
          status: 200,
          statusText: "OK",
          durationMs: index,
          headers: {},
          body: String(index),
          bytes: 1
        },
        `2026-01-01T00:00:0${index % 10}.000Z`
      );
    }
    expect(tab.history).toHaveLength(50);
    expect(tab.history[0].result.body).toBe("54");
  });

  it("sorts pinned tabs ahead of unpinned tabs", () => {
    const state = normalizeReplayTabState({
      tabs: [
        { id: "a", name: "A", pinned: false, draft: { method: "GET", url: "", headers: {}, body: "" }, history: [], environmentId: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        { id: "b", name: "B", pinned: true, draft: { method: "GET", url: "", headers: {}, body: "" }, history: [], environmentId: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
      ],
      activeTabId: "a"
    });
    expect(state.tabs[0].id).toBe("b");
  });

  it("drops invalid tabs and history entries", () => {
    const state = normalizeReplayTabState({
      tabs: [{ id: "a", name: "", draft: {}, history: [{ id: "h1" }], environmentId: "", createdAt: "", updatedAt: "" }],
      activeTabId: "missing"
    });
    expect(state.tabs[0].name).toBe("Request 1");
    expect(state.tabs[0].history).toEqual([]);
  });

  it("rejects invalid tab names and history entries", () => {
    expect(normalizeReplayTab({ name: "" }, "tab-1", "2026-01-01T00:00:00.000Z")).toBeNull();
    const tab = createReplayTab("Auth");
    expect(appendReplayHistory(tab, tab.draft, null as never).history).toEqual([]);
    expect(
      normalizeReplayTab(
        {
          name: "Auth",
          history: [{ id: "bad", result: ["not-an-object"] as never, sentAt: "", draft: { method: "GET", url: "", headers: {}, body: "" } }]
        },
        "tab-1",
        "2026-01-01T00:00:00.000Z"
      )?.history
    ).toEqual([]);
  });

  it("updates the active tab draft", () => {
    const state = defaultReplayTabState("2026-01-01T00:00:00.000Z");
    const next = updateActiveTabDraft(state, { method: "POST", url: "https://example.test", headers: {}, body: "{}" });
    expect(next.tabs[0].draft.method).toBe("POST");
  });

  it("handles malformed persisted state shapes", () => {
    expect(normalizeReplayTabState([]).tabs).toHaveLength(1);
    expect(
      normalizeReplayTabState({
        tabs: [null, { id: "x", name: "Valid", draft: {}, history: "bad", pinned: true, environmentId: "env", createdAt: "", updatedAt: "" }],
        activeTabId: "x"
      }).activeTabId
    ).toBe("x");
    expect(createReplayTab("").name).toBe("Request");
    expect(
      normalizeReplayTab(
        {
          id: "tab-1",
          name: "History",
          history: [
            {
              id: "h1",
              sentAt: "2026-01-01T00:00:00.000Z",
              draft: { method: "GET", url: "https://example.test", headers: {}, body: "" },
              result: {
                ok: true,
                status: 200,
                statusText: "OK",
                durationMs: 1,
                headers: { "Content-Type": "application/json" },
                body: "ok",
                bytes: 2
              }
            }
          ]
        },
        "tab-1",
        "2026-01-01T00:00:00.000Z"
      )?.history
    ).toHaveLength(1);
    expect(normalizeReplayTabState({ tabs: [], activeTabId: "missing" }).tabs[0].name).toBe("Request 1");
  });
});
