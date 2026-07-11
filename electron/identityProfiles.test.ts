import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertIdentityPathSegment,
  createIdentityActivation,
  createSerializedIdentityActivator,
  identityBrowserProfileDir
} from "./identityProfiles.js";

describe("identity browser profiles", () => {
  it("builds a dedicated profile path from bounded identifiers", () => {
    expect(identityBrowserProfileDir("/tmp/radar", "profile_1", "identity-user-a")).toBe(
      path.join("/tmp/radar", "profiles", "profile_1", "identities", "identity-user-a", "browser-profile")
    );
  });

  it.each(["", "../escape", "with/slash", "with space", ".hidden"])("rejects unsafe path segment %j", (value) => {
    expect(() => assertIdentityPathSegment(value, "Identity ID")).toThrow("Identity ID is invalid.");
  });

  it("creates a stable activation record without exposing browser state", () => {
    expect(
      createIdentityActivation(
        "/tmp/radar/profiles/p/identities/i/browser-profile",
        "identity-user-a",
        "2026-07-10T12:00:00.000Z",
        "activation_1"
      )
    ).toEqual({
      identityId: "identity-user-a",
      activationId: "activation_1",
      activatedAt: "2026-07-10T12:00:00.000Z",
      profileDir: "/tmp/radar/profiles/p/identities/i/browser-profile"
    });
  });

  it("serializes profile switches", async () => {
    const activate = createSerializedIdentityActivator();
    const order: string[] = [];
    let releaseFirst = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = activate(async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    const secondTask = vi.fn(async () => {
      order.push("second:start");
    });
    const second = activate(secondTask);

    await vi.waitFor(() => expect(order).toEqual(["first:start"]));
    expect(secondTask).not.toHaveBeenCalled();
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });
});
