import { describe, expect, it } from "vitest";
import {
  MAX_IDENTITY_PROFILES,
  identityProfileForLab,
  normalizeIdentityActivation,
  normalizeIdentityProfile,
  normalizeIdentityProfiles,
  type IdentityProfile
} from "./identityProfiles.js";

const CREATED_AT = "2026-07-10T12:00:00.000Z";
const UPDATED_AT = "2026-07-10T12:05:00.000Z";

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "identity-user-a",
    workspaceId: "workspace-acme",
    label: "Tenant A user",
    kind: "user",
    roleLabel: "member",
    tenantLabel: "tenant-a",
    origin: "https://app.target.test/account",
    notes: "Operator-owned test identity.",
    isolation: "dedicated-profile",
    health: "healthy",
    refreshMode: "manual",
    jarRevision: 2,
    containerId: "container-user-a",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  const normalized = normalizeIdentityProfile(profileInput(overrides));
  if (!normalized) throw new Error("Identity profile fixture failed to normalize.");
  return normalized;
}

describe("identityProfiles", () => {
  it("requires strict identifiers, canonical HTTP origins, labels, and timestamps", () => {
    expect(
      normalizeIdentityProfile(
        profileInput({
          origin: "https://Example.Target.Test:443/account?token=secret",
          createdAt: "2026-07-10T08:00:00-04:00",
          updatedAt: "2026-07-10T08:05:00-04:00"
        })
      )
    ).toMatchObject({
      id: "identity-user-a",
      workspaceId: "workspace-acme",
      origin: "https://example.target.test",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT
    });

    for (const invalid of [
      profileInput({ id: "../identity" }),
      profileInput({ id: "identity with spaces" }),
      profileInput({ workspaceId: "workspace/acme" }),
      profileInput({ label: "" }),
      profileInput({ origin: "file:///tmp/profile" }),
      profileInput({ origin: "not-a-url" }),
      profileInput({ createdAt: "not-a-date" }),
      profileInput({ updatedAt: "not-a-date" })
    ]) {
      expect(normalizeIdentityProfile(invalid)).toBeNull();
    }
  });

  it("never accepts or emits raw cookie and storage secret values", () => {
    const normalized = normalizeIdentityProfile(
      profileInput({
        cookies: [{ name: "sid", value: "cookie-secret" }],
        cookieValues: { sid: "cookie-secret-two" },
        localStorage: { accessToken: "local-secret" },
        sessionStorage: { nonce: "session-secret" },
        storage: {
          localStorage: { refreshToken: "nested-secret" },
          sessionStorage: { state: "nested-session-secret" }
        }
      })
    );
    const lab = normalized ? identityProfileForLab(normalized) : null;
    const serialized = JSON.stringify({ normalized, lab });

    expect(normalized).not.toHaveProperty("cookies");
    expect(normalized).not.toHaveProperty("localStorage");
    expect(normalized).not.toHaveProperty("sessionStorage");
    expect(lab).toMatchObject({
      cookieNames: [],
      cookieCount: 0,
      localStorageKeys: [],
      localStorageKeyCount: 0,
      sessionStorageKeys: [],
      sessionStorageKeyCount: 0
    });
    for (const secret of [
      "cookie-secret",
      "cookie-secret-two",
      "local-secret",
      "session-secret",
      "nested-secret",
      "nested-session-secret"
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("defaults health and isolation safely while bounding operator-authored labels and notes", () => {
    const normalized = profile({
      health: "unsupported",
      isolation: "unsupported",
      roleLabel: `role-${"r".repeat(200)}`,
      tenantLabel: `tenant-${"t".repeat(200)}`,
      notes: `notes-${"n".repeat(3_000)}\u0000\u0007`
    });

    expect(normalized.health).toBe("unknown");
    expect(normalized.isolation).toBe("dedicated-profile");
    expect(normalized.roleLabel).toHaveLength(100);
    expect(normalized.tenantLabel).toHaveLength(120);
    expect(normalized.notes).toHaveLength(2_000);
    expect(normalized.notes).not.toContain("\u0000");
    expect(normalized.notes).not.toContain("\u0007");

    expect(profile({ roleLabel: "", tenantLabel: "" })).toMatchObject({
      roleLabel: "unclassified",
      tenantLabel: "unknown"
    });
  });

  it("downgrades invalid workflow refresh configuration and preserves valid workflow refresh", () => {
    const missingWorkflow = profile({ refreshMode: "workflow", refreshWorkflowId: "" });
    expect(missingWorkflow.refreshMode).toBe("manual");
    expect(missingWorkflow).not.toHaveProperty("refreshWorkflowId");
    const invalidWorkflow = profile({ refreshMode: "workflow", refreshWorkflowId: "workflow with spaces" });
    expect(invalidWorkflow.refreshMode).toBe("manual");
    expect(invalidWorkflow).not.toHaveProperty("refreshWorkflowId");
    expect(profile({ refreshMode: "workflow", refreshWorkflowId: "workflow_auth-refresh" })).toMatchObject({
      refreshMode: "workflow",
      refreshWorkflowId: "workflow_auth-refresh"
    });
    expect(profile({ refreshMode: "unsupported", refreshWorkflowId: "workflow_auth-refresh" }).refreshMode).toBe(
      "manual"
    );
  });

  it("normalizes stable metadata, revision and health-age bounds idempotently", () => {
    const normalized = profile({
      containerId: "not a container id",
      jarRevision: 9_999_999,
      maxHealthAgeMs: 1,
      authFingerprint: "f".repeat(300),
      lastEvidenceRef: `capture:${"e".repeat(300)}`,
      lastActivatedAt: "2026-07-10T08:01:00-04:00",
      lastCheckedAt: "invalid",
      archivedAt: "2026-07-10T08:06:00-04:00"
    });

    expect(normalized).toMatchObject({
      containerId: "container-identity-user-a",
      jarRevision: 1_000_000,
      maxHealthAgeMs: 60_000,
      authFingerprint: "f".repeat(160),
      lastEvidenceRef: `capture:${"e".repeat(172)}`,
      lastActivatedAt: "2026-07-10T12:01:00.000Z",
      archivedAt: "2026-07-10T12:06:00.000Z"
    });
    expect(normalized).not.toHaveProperty("lastCheckedAt");
    expect(normalizeIdentityProfile(normalized)).toEqual(normalized);

    expect(profile({ jarRevision: -5, maxHealthAgeMs: Number.MAX_SAFE_INTEGER })).toMatchObject({
      jarRevision: 0,
      maxHealthAgeMs: 30 * 24 * 60 * 60 * 1_000
    });
  });

  it("validates activation identifiers and timestamps while bounding public failure metadata", () => {
    const activation = normalizeIdentityActivation({
      id: "activation-1",
      sessionId: "session-1",
      workspaceId: "workspace-acme",
      identityId: "identity-user-a",
      startedAt: "2026-07-10T08:00:00-04:00",
      endedAt: "2026-07-10T08:10:00-04:00",
      status: "active",
      browserInstanceId: "browser-1",
      authFingerprint: "a".repeat(300),
      error: `failure-${"x".repeat(800)}`,
      cookies: [{ value: "activation-cookie-secret" }]
    });

    expect(activation).toMatchObject({
      id: "activation-1",
      sessionId: "session-1",
      workspaceId: "workspace-acme",
      identityId: "identity-user-a",
      startedAt: CREATED_AT,
      endedAt: "2026-07-10T12:10:00.000Z",
      status: "active",
      browserInstanceId: "browser-1",
      authFingerprint: "a".repeat(160)
    });
    expect(activation?.error).toHaveLength(500);
    expect(JSON.stringify(activation)).not.toContain("activation-cookie-secret");
    expect(
      normalizeIdentityActivation({
        ...activation,
        id: "bad/id"
      })
    ).toBeNull();
    expect(
      normalizeIdentityActivation({
        ...activation,
        startedAt: "invalid"
      })
    ).toBeNull();
    expect(
      normalizeIdentityActivation({
        ...activation,
        status: "unsupported"
      })
    ).toMatchObject({ status: "failed" });
  });

  it("converts profiles to secret-free Identity Lab summaries with explicit health mapping", () => {
    const health: Array<[IdentityProfile["health"], ReturnType<typeof identityProfileForLab>["health"]]> = [
      ["healthy", "ready"],
      ["stale", "stale"],
      ["expired", "invalid"],
      ["error", "invalid"],
      ["unknown", "unknown"],
      ["checking", "unknown"]
    ];

    for (const [profileHealth, labHealth] of health) {
      expect(identityProfileForLab(profile({ health: profileHealth }))).toMatchObject({
        id: "identity-user-a",
        projectId: "workspace-acme",
        key: "identity-user-a",
        label: "Tenant A user",
        kind: "user",
        role: "member",
        tenant: "tenant-a",
        origin: "https://app.target.test",
        health: labHealth,
        cookieNames: [],
        localStorageKeys: [],
        sessionStorageKeys: [],
        updatedAt: UPDATED_AT
      });
    }
  });

  it("deduplicates by stable identity id and caps normalized profile collections", () => {
    const inputs = Array.from({ length: MAX_IDENTITY_PROFILES + 5 }, (_, index) =>
      profileInput({
        id: `identity-${index}`,
        label: `Identity ${index}`,
        containerId: `container-${index}`
      })
    );
    const normalized = normalizeIdentityProfiles([inputs[0], inputs[0], ...inputs, null, "invalid"]);

    expect(normalized).toHaveLength(MAX_IDENTITY_PROFILES);
    expect(new Set(normalized.map((item) => item.id)).size).toBe(MAX_IDENTITY_PROFILES);
    expect(normalized[0]?.id).toBe("identity-0");
    expect(normalized.at(-1)?.id).toBe(`identity-${MAX_IDENTITY_PROFILES - 1}`);
    expect(normalizeIdentityProfiles({ profiles: inputs })).toEqual([]);
  });
});
