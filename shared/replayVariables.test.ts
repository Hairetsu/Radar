import { describe, expect, it } from "vitest";
import { applyEnvironmentToDraft, createReplayEnvironment, normalizeReplayEnvironment, normalizeReplayEnvironments, prepareReplayDraft, resolveEnvironmentVariables, substituteVariables } from "./replayVariables.js";
import type { ReplayEnvironment } from "./domain.js";

describe("replayVariables", () => {
  it("substitutes variables in text", () => {
    expect(substituteVariables("https://{{host}}/api/{{id}}", { host: "example.test", id: "42" })).toBe(
      "https://example.test/api/42"
    );
  });

  it("applies environment variables to drafts", () => {
    const environments: ReplayEnvironment[] = [
      {
        id: "env-1",
        name: "Staging",
        variables: { token: "abc123", host: "staging.example.test" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    const draft = applyEnvironmentToDraft(
      {
        method: "GET",
        url: "https://{{host}}/profile",
        headers: { Authorization: "Bearer {{token}}" },
        body: ""
      },
      environments,
      "env-1"
    );
    expect(draft.url).toBe("https://staging.example.test/profile");
    expect(draft.headers.Authorization).toBe("Bearer abc123");
  });

  it("leaves unknown variables untouched", () => {
    expect(substituteVariables("{{missing}}", {})).toBe("{{missing}}");
  });

  it("prepares replay drafts without an environment", () => {
    expect(prepareReplayDraft({ method: "GET", url: "https://example.test", headers: {}, body: "" }).url).toBe(
      "https://example.test"
    );
  });

  it("rejects unresolved variables when an environment is selected", () => {
    const environments: ReplayEnvironment[] = [
      {
        id: "env-1",
        name: "Incomplete",
        variables: { known: "value" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    expect(() =>
      prepareReplayDraft(
        { method: "POST", url: "https://example.test/{{missing}}", headers: {}, body: "{{known}}" },
        environments,
        "env-1"
      )
    ).toThrow("Missing environment variable: missing");
  });

  it("normalizes environments and rejects invalid names", () => {
    expect(normalizeReplayEnvironment({ name: "" }, "env-1", "2026-01-01T00:00:00.000Z")).toBeNull();
    expect(normalizeReplayEnvironments(null)).toEqual([]);
    expect(createReplayEnvironment("").name).toBe("Environment");
    expect(resolveEnvironmentVariables([], "missing")).toEqual({});
  });
});
