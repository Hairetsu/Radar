import { describe, expect, it } from "vitest";
import { defaultProxyProfiles, normalizeProxyProfile } from "./proxyProfiles";

describe("proxy profiles", () => {
  it("creates the local proxy client profile set", () => {
    expect(defaultProxyProfiles().map((profile) => profile.id)).toEqual([
      "radar-browser",
      "external-browser",
      "cli",
      "mobile-device"
    ]);
  });

  it("normalizes notes and rejects unknown profile ids", () => {
    expect(normalizeProxyProfile({ id: "cli", notes: "  export HTTP_PROXY=http://127.0.0.1:8088  " }, "now")).toEqual(
      expect.objectContaining({
        id: "cli",
        label: "CLI Tools",
        notes: "export HTTP_PROXY=http://127.0.0.1:8088",
        updatedAt: "now"
      })
    );
    expect(normalizeProxyProfile({ id: "unknown", notes: "x" })).toBeNull();
  });
});
