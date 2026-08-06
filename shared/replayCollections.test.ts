import { describe, expect, it } from "vitest";
import { createCollectionItem, normalizeReplayCollections } from "./replayCollections.js";

describe("replayCollections", () => {
  it("normalizes collections and items", () => {
    const collections = normalizeReplayCollections(
      [
        {
          id: "collection-1",
          name: "Auth flows",
          items: [
            {
              id: "item-1",
              name: "Login",
              draft: { method: "POST", url: "https://example.test/login", headers: {}, body: "{}" },
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z"
            }
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z"
        }
      ],
      "2026-02-01T00:00:00.000Z"
    );
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({
      name: "Auth flows",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z"
    });
    expect(collections[0].items[0]).toMatchObject({
      name: "Login",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
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
