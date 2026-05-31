import { describe, expect, it } from "vitest";
import { createCollectionItem, normalizeReplayCollections } from "./replayCollections.js";

describe("replayCollections", () => {
  it("normalizes collections and items", () => {
    const collections = normalizeReplayCollections([
      {
        id: "collection-1",
        name: "Auth flows",
        items: [{ id: "item-1", name: "Login", draft: { method: "POST", url: "https://example.test/login", headers: {}, body: "{}" } }]
      }
    ]);
    expect(collections).toHaveLength(1);
    expect(collections[0].items[0].name).toBe("Login");
  });

  it("creates collection items", () => {
    const item = createCollectionItem("Profile", { method: "GET", url: "https://example.test/me", headers: {}, body: "" });
    expect(item.name).toBe("Profile");
  });

  it("rejects invalid collections", () => {
    expect(normalizeReplayCollections([{ name: "" }])).toEqual([]);
    expect(normalizeReplayCollections([{ name: "Auth", items: [{ name: "" }] }])[0]?.items).toEqual([]);
  });
});
