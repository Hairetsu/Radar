import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceContextSnapshot,
  normalizeWorkspaceControlIntent,
  normalizeWorkspaceSelectionRef
} from "./windowCoordination.js";

describe("window coordination", () => {
  it("normalizes bounded workspace context without raw evidence", () => {
    expect(normalizeWorkspaceContextSnapshot({
      revision: 4,
      mode: "ai-first",
      activeView: "traffic",
      project: { id: "project-1", name: "Assessment" },
      session: { id: "session-1", name: "Pass 1" },
      browser: { open: true, url: "https://target.test/path", title: "Target" },
      selection: { kind: "capture", id: "capture-1", label: "GET /path", responseBody: "secret" },
      executingRunId: "run-1",
      attentionCount: 2,
      rawHeaders: { authorization: "secret" }
    })).toEqual({
      revision: 4,
      mode: "ai-first",
      activeView: "traffic",
      project: { id: "project-1", name: "Assessment" },
      session: { id: "session-1", name: "Pass 1" },
      browser: { open: true, url: "https://target.test/path", title: "Target" },
      selection: { kind: "capture", id: "capture-1", label: "GET /path" },
      executingRunId: "run-1",
      attentionCount: 2
    });
  });

  it("rejects unsafe or malformed workspace intents", () => {
    expect(normalizeWorkspaceControlIntent({ type: "execute-javascript", code: "alert(1)" })).toBeNull();
    expect(normalizeWorkspaceControlIntent({ type: "propose-scope-origin", origin: "file:///tmp/secret" })).toBeNull();
    expect(normalizeWorkspaceControlIntent({ type: "show-view", view: "unknown" })).toBeNull();
    expect(normalizeWorkspaceSelectionRef({ kind: "capture", id: "" })).toBeNull();
  });

  it("accepts the allowlisted intent family", () => {
    expect(normalizeWorkspaceControlIntent({ type: "show-view", view: "findings" })).toEqual({
      type: "show-view",
      view: "findings"
    });
    expect(normalizeWorkspaceControlIntent({
      type: "propose-scope-origin",
      origin: "https://target.test/path",
      reason: "Review this origin"
    })).toEqual({
      type: "propose-scope-origin",
      origin: "https://target.test",
      reason: "Review this origin"
    });
  });
});
