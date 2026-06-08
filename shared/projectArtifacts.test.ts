import { describe, expect, it } from "vitest";
import { normalizeProjectNote, normalizeProjectNotes, normalizeSavedView, normalizeSavedViews } from "./projectArtifacts.js";

describe("project artifacts", () => {
  it("normalizes project notes and rejects empty entries", () => {
    expect(normalizeProjectNote({ id: "note 1", title: "  Client   context ", body: "Evidence notes" }, "fallback", "now")).toEqual({
      id: "note-1",
      title: "Client context",
      body: "Evidence notes",
      createdAt: "now",
      updatedAt: "now"
    });
    expect(normalizeProjectNote({ title: "", body: "" }, "fallback")).toBeNull();
    expect(normalizeProjectNotes([{ title: "A" }, null, { body: "B" }], "now").map((note) => note.title)).toEqual([
      "A",
      "Untitled note"
    ]);
  });

  it("normalizes saved views with safe targets and string state", () => {
    expect(
      normalizeSavedView(
        {
          id: "view 1",
          name: "  API 403s ",
          view: "traffic",
          description: "Saved query",
          state: { trafficQuery: "status:403", count: 4, empty: "" }
        },
        "fallback",
        "now"
      )
    ).toEqual({
      id: "view-1",
      name: "API 403s",
      view: "traffic",
      description: "Saved query",
      state: { trafficQuery: "status:403", count: "4" },
      createdAt: "now",
      updatedAt: "now"
    });
    expect(normalizeSavedView({ name: "Bad target", view: "unknown" }, "view-2")?.view).toBe("traffic");
    expect(normalizeSavedViews([{ name: "One" }, { name: "" }])).toHaveLength(1);
  });
});
