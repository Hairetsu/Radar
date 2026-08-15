import { describe, expect, it } from "vitest";
import type { AgentCapabilityLeaseRequest, AgentCapabilityState, AgentToolName } from "./agent-types.js";
import {
  agentCapabilityRiskForUse,
  agentToolRequiresCapabilityLease,
  agentToolRiskTier,
  authorizeAgentCapability,
  createAgentCapabilityState,
  expandAgentCapabilityLeaseForMatchingActions,
  grantAgentCapabilityLease,
  hasMatchingAgentCapabilityLease,
  normalizeAgentCapabilityActionRequest,
  normalizeAgentCapabilityLeaseRequest,
  normalizeAgentCapabilityState,
  proposeAgentCapabilityLease,
  revokeAgentCapabilityLease,
  revokeGrantedAgentCapabilities
} from "./agentCapabilities.js";

const NOW = "2026-07-10T12:00:00.000Z";

function request(overrides: Partial<AgentCapabilityLeaseRequest> = {}): AgentCapabilityLeaseRequest {
  return {
    name: "Invoice read comparison",
    riskTier: "active",
    tools: ["sendReplay"],
    grants: [
      {
        origin: "https://api.target.test",
        method: "GET",
        pathPrefix: "/v1/invoices/",
        identity: "user-b"
      }
    ],
    durationMs: 120_000,
    maxUses: 2,
    maxRequests: 2,
    maxConcurrency: 1,
    maxPayloadBytes: 1024,
    reason: "Compare one resource under the challenger identity.",
    ...overrides
  };
}

function grantedState(overrides: Partial<AgentCapabilityLeaseRequest> = {}) {
  const proposed = proposeAgentCapabilityLease(createAgentCapabilityState(), request(overrides), "lease-1", NOW);
  if (!proposed.ok) throw new Error(proposed.error);
  const granted = grantAgentCapabilityLease(proposed.state, proposed.lease.id, {
    allowlist: ["https://api.target.test"],
    allowedTools: ["sendReplay", "runWorkflow", "navigateBrowser"],
    authFingerprint: "auth-fp",
    now: NOW
  });
  if (!granted.ok) throw new Error(granted.error);
  return granted.state;
}

function use(overrides: Partial<Parameters<typeof authorizeAgentCapability>[1]> = {}) {
  return {
    tool: "sendReplay" as const,
    url: "https://api.target.test/v1/invoices/817",
    method: "GET",
    identity: "user-b",
    requestCost: 1,
    concurrency: 1,
    payloadBytes: 0,
    allowlist: ["https://api.target.test"],
    authFingerprint: "auth-fp",
    ...overrides
  };
}

describe("agent capability leases", () => {
  it("classifies lease-gated tools and derives destructive network methods", () => {
    const expected: Array<[AgentToolName, ReturnType<typeof agentToolRiskTier>]> = [
      ["openBrowser", "navigate"],
      ["navigateBrowser", "navigate"],
      ["saveAuthState", "reversible"],
      ["loadAuthState", "reversible"],
      ["fillInput", "reversible"],
      ["clickElement", "active"],
      ["submitForm", "active"],
      ["sendReplay", "active"],
      ["runWorkflow", "active"],
      ["getCaptures", null],
      ["prepareReplayTab", null]
    ];
    for (const [tool, tier] of expected) {
      expect(agentToolRiskTier(tool)).toBe(tier);
      expect(agentToolRequiresCapabilityLease(tool)).toBe(Boolean(tier));
    }
    expect(agentCapabilityRiskForUse({ tool: "sendReplay", method: "DELETE" })).toBe("destructive");
    expect(agentCapabilityRiskForUse({ tool: "sendReplay", method: "CUSTOM" })).toBe("destructive");
    expect(agentCapabilityRiskForUse({ tool: "sendReplay", method: "POST" })).toBe("active");
    expect(agentCapabilityRiskForUse({ tool: "getCaptures", method: "GET" })).toBeNull();
  });

  it("normalizes exact grant tuples without creating a Cartesian product", () => {
    const normalized = normalizeAgentCapabilityLeaseRequest({
      ...request(),
      name: "  Invoice lease  ",
      tools: ["sendReplay", "sendReplay", "getCaptures"],
      grants: [
        { origin: "https://api.target.test:443/a", method: "get", pathPrefix: "v1/invoices/", identity: "user-b" },
        { origin: "https://api.target.test", method: "GET", pathPrefix: "/v1/invoices/", identity: "user-b" },
        { origin: "https://admin.target.test", method: "POST", pathPrefix: "/v1/review", identity: "admin" },
        { origin: "not a url", method: "GET", pathPrefix: "/", identity: "current" }
      ],
      durationMs: 999_999_999,
      maxUses: 500,
      maxRequests: 500,
      maxConcurrency: 99,
      maxPayloadBytes: 9_999_999
    });

    expect(normalized).toMatchObject({
      name: "Invoice lease",
      tools: ["sendReplay"],
      durationMs: 3_600_000,
      maxUses: 50,
      maxRequests: 100,
      maxConcurrency: 4,
      maxPayloadBytes: 1_048_576,
      grants: [
        { origin: "https://api.target.test", method: "GET", pathPrefix: "/v1/invoices/", identity: "user-b" },
        { origin: "https://admin.target.test", method: "POST", pathPrefix: "/v1/review", identity: "admin" }
      ]
    });
  });

  it("rejects incomplete, risk-downgraded, and destructive lease requests", () => {
    expect(normalizeAgentCapabilityLeaseRequest(null)).toBeNull();
    expect(normalizeAgentCapabilityLeaseRequest({ ...request(), reason: "" })).toBeNull();
    expect(normalizeAgentCapabilityLeaseRequest({ ...request(), grants: [] })).toBeNull();
    expect(normalizeAgentCapabilityLeaseRequest({ ...request(), tools: [] })).toBeNull();
    expect(normalizeAgentCapabilityLeaseRequest({ ...request(), riskTier: "navigate" })).toBeNull();
    expect(normalizeAgentCapabilityLeaseRequest({ ...request(), riskTier: "destructive" })).toBeNull();
    expect(
      normalizeAgentCapabilityLeaseRequest({
        ...request(),
        grants: [{ origin: "https://api.target.test", method: "DELETE", pathPrefix: "/v1/invoices/", identity: "user-b" }]
      })
    ).toBeNull();
  });

  it("normalizes operator actions and rejects forged or malformed shapes", () => {
    expect(normalizeAgentCapabilityActionRequest({ action: "propose", expectedRevision: 2, lease: request() })).toEqual({
      action: "propose",
      expectedRevision: 2,
      lease: request()
    });
    expect(normalizeAgentCapabilityActionRequest({ action: "grant", expectedRevision: 3, leaseId: "lease-1" })).toEqual({
      action: "grant",
      expectedRevision: 3,
      leaseId: "lease-1"
    });
    expect(
      normalizeAgentCapabilityActionRequest({
        action: "grant",
        expectedRevision: 3,
        leaseId: "lease-1",
        approval: "all-matching"
      })
    ).toEqual({
      action: "grant",
      expectedRevision: 3,
      leaseId: "lease-1",
      approval: "all-matching"
    });
    expect(normalizeAgentCapabilityActionRequest({ action: "revoke", expectedRevision: 4, leaseId: "lease-1", reason: "Narrow scope" })).toEqual({
      action: "revoke",
      expectedRevision: 4,
      leaseId: "lease-1",
      reason: "Narrow scope"
    });
    expect(normalizeAgentCapabilityActionRequest({ action: "grant", leaseId: "" })).toBeNull();
    expect(
      normalizeAgentCapabilityActionRequest({
        action: "grant",
        leaseId: "lease-1",
        approval: "everything-everywhere"
      })
    ).toBeNull();
    expect(normalizeAgentCapabilityActionRequest({ action: "propose", lease: {} })).toBeNull();
    expect(normalizeAgentCapabilityActionRequest({ action: "unknown" })).toBeNull();
  });

  it("grants only draft leases inside scope and profile ceilings with an auth binding", () => {
    const proposed = proposeAgentCapabilityLease(createAgentCapabilityState(), request(), "lease-1", NOW);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.state).toMatchObject({ revision: 1, leases: [expect.objectContaining({ status: "draft" })] });

    expect(
      grantAgentCapabilityLease(proposed.state, "lease-1", {
        allowlist: ["https://api.target.test"],
        allowedTools: [],
        authFingerprint: "auth-fp",
        now: NOW
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("profile") });
    expect(
      grantAgentCapabilityLease(proposed.state, "lease-1", {
        allowlist: ["https://api.target.test"],
        allowedTools: ["sendReplay"],
        authFingerprint: "auth-fp",
        ceiling: {
          maxRiskTier: "navigate",
          maxDurationMs: 60000,
          maxUses: 1,
          maxRequests: 1,
          maxConcurrency: 1,
          maxPayloadBytes: 0
        },
        now: NOW
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("profile ceiling") });
    expect(
      grantAgentCapabilityLease(proposed.state, "lease-1", {
        allowlist: ["https://other.test"],
        allowedTools: ["sendReplay"],
        authFingerprint: "auth-fp",
        now: NOW
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("scope") });
    expect(
      grantAgentCapabilityLease(proposed.state, "lease-1", {
        allowlist: ["https://api.target.test"],
        allowedTools: ["sendReplay"],
        authFingerprint: "",
        now: NOW
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("auth fingerprint") });

    const granted = grantAgentCapabilityLease(proposed.state, "lease-1", {
      allowlist: ["https://api.target.test"],
      allowedTools: ["sendReplay"],
      authFingerprint: "auth-fp",
      now: NOW
    });
    expect(granted).toMatchObject({
      ok: true,
      state: { revision: 2 },
      lease: {
        status: "granted",
        expiresAt: "2026-07-10T12:02:00.000Z",
        scopeSnapshot: ["https://api.target.test"],
        authFingerprint: "auth-fp"
      }
    });
    if (granted.ok) {
      expect(grantAgentCapabilityLease(granted.state, "lease-1", { allowlist: [], allowedTools: [], authFingerprint: "", now: NOW })).toMatchObject({ ok: false, error: expect.stringContaining("draft") });
    }
  });

  it("expands approve-all authority only across matching paths and profile caps", () => {
    const proposed = proposeAgentCapabilityLease(
      createAgentCapabilityState(),
      request({
        name: "Authorize clickElement",
        tools: ["clickElement"],
        grants: [
          {
            origin: "https://api.target.test",
            method: "GET",
            pathPrefix: "/v1/invoices/817?panel=activity",
            identity: "user-b"
          }
        ],
        maxUses: 1,
        maxRequests: 1,
        maxPayloadBytes: 0
      }),
      "lease-click",
      NOW
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const expanded = expandAgentCapabilityLeaseForMatchingActions(
      proposed.state,
      proposed.lease.id,
      {
        maxRiskTier: "active",
        maxDurationMs: 300_000,
        maxUses: 12,
        maxRequests: 20,
        maxConcurrency: 1,
        maxPayloadBytes: 256 * 1024
      },
      NOW
    );
    expect(expanded).toMatchObject({
      ok: true,
      state: { revision: 1 },
      lease: {
        status: "draft",
        tools: ["clickElement"],
        grants: [
          {
            origin: "https://api.target.test",
            method: "GET",
            pathPrefix: "/",
            identity: "user-b"
          }
        ],
        durationMs: 300_000,
        maxUses: 12,
        maxRequests: 20,
        maxConcurrency: 1,
        maxPayloadBytes: 0
      }
    });
    expect(
      expandAgentCapabilityLeaseForMatchingActions(
        {
          ...proposed.state,
          leases: [
            {
              ...proposed.lease,
              tools: ["clickElement", "sendReplay"]
            }
          ]
        },
        proposed.lease.id,
        {
          maxRiskTier: "active",
          maxDurationMs: 300_000,
          maxUses: 12,
          maxRequests: 20,
          maxConcurrency: 1,
          maxPayloadBytes: 256 * 1024
        },
        NOW
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining("one tool") });
  });

  it("authorizes only a matching exact tuple and atomically exhausts usage", () => {
    const state = grantedState();
    expect(hasMatchingAgentCapabilityLease(state, use(), "2026-07-10T12:00:10.000Z")).toBe(true);
    expect(
      hasMatchingAgentCapabilityLease(
        state,
        use({ url: "https://api.target.test/v1/other/817" }),
        "2026-07-10T12:00:10.000Z"
      )
    ).toBe(false);
    const first = authorizeAgentCapability(state, use(), "receipt-1", "2026-07-10T12:00:10.000Z");
    expect(first).toMatchObject({
      required: true,
      allowed: true,
      lease: { id: "lease-1", usedUses: 1, usedRequests: 1, status: "granted" },
      receipt: { decision: "allowed", origin: "https://api.target.test", method: "GET", path: "/v1/invoices/817" }
    });
    if (!first.required) return;
    const second = authorizeAgentCapability(first.state, use(), "receipt-2", "2026-07-10T12:00:20.000Z");
    expect(second).toMatchObject({
      allowed: true,
      lease: { usedUses: 2, usedRequests: 2, status: "exhausted" },
      receipt: { reason: expect.stringContaining("now exhausted") }
    });
    if (!second.required) return;
    const third = authorizeAgentCapability(second.state, use(), "receipt-3", "2026-07-10T12:00:30.000Z");
    expect(third).toMatchObject({ allowed: false, receipt: { decision: "blocked" } });
  });

  it("does not combine origin, method, path, or identity across separate grants", () => {
    const state = grantedState({
      maxUses: 8,
      maxRequests: 8,
      grants: [
        { origin: "https://api.target.test", method: "GET", pathPrefix: "/public/", identity: "anonymous" },
        { origin: "https://api.target.test", method: "POST", pathPrefix: "/admin/", identity: "admin" }
      ]
    });

    const valid = authorizeAgentCapability(
      state,
      use({ url: "https://api.target.test/public/list", identity: "anonymous" }),
      "receipt-valid",
      "2026-07-10T12:00:10.000Z"
    );
    expect(valid).toMatchObject({ allowed: true });
    const mixed = authorizeAgentCapability(
      state,
      use({ url: "https://api.target.test/admin/list", method: "GET", identity: "admin" }),
      "receipt-mixed",
      "2026-07-10T12:00:10.000Z"
    );
    expect(mixed).toMatchObject({ allowed: false, reason: expect.stringContaining("No granted") });
  });

  it("fails closed on expiry, saved-scope drift, auth drift, payload, concurrency, and request caps", () => {
    const expired = authorizeAgentCapability(grantedState(), use(), "receipt-expired", "2026-07-10T12:02:00.000Z");
    expect(expired).toMatchObject({ allowed: false, lease: { status: "expired" }, receipt: { decision: "revoked" } });

    const scopeDrift = authorizeAgentCapability(
      grantedState(),
      use({ allowlist: ["https://api.target.test", "https://new.target.test"] }),
      "receipt-scope",
      "2026-07-10T12:00:10.000Z"
    );
    expect(scopeDrift).toMatchObject({ allowed: false, reason: expect.stringContaining("scope changed") });

    const authDrift = authorizeAgentCapability(
      grantedState(),
      use({ authFingerprint: "rotated" }),
      "receipt-auth",
      "2026-07-10T12:00:10.000Z"
    );
    expect(authDrift).toMatchObject({ allowed: false, reason: expect.stringContaining("Auth state changed") });

    expect(authorizeAgentCapability(grantedState(), use({ payloadBytes: 2048 }), "receipt-payload", "2026-07-10T12:00:10.000Z")).toMatchObject({ allowed: false });
    expect(authorizeAgentCapability(grantedState(), use({ concurrency: 2 }), "receipt-concurrency", "2026-07-10T12:00:10.000Z")).toMatchObject({ allowed: false });
    expect(authorizeAgentCapability(grantedState({ maxRequests: 1 }), use({ requestCost: 2 }), "receipt-request", "2026-07-10T12:00:10.000Z")).toMatchObject({ allowed: false });
    expect(
      hasMatchingAgentCapabilityLease(
        grantedState(),
        use({ authFingerprint: "rotated" }),
        "2026-07-10T12:00:10.000Z"
      )
    ).toBe(false);
  });

  it("passes non-gated tools and blocks destructive dispatch even with an active lease", () => {
    expect(
      authorizeAgentCapability(
        createAgentCapabilityState(),
        use({ tool: "getCaptures", url: "", method: "" }),
        "receipt-read",
        NOW
      )
    ).toEqual({ required: false, allowed: true, state: createAgentCapabilityState() });
    expect(
      authorizeAgentCapability(
        grantedState(),
        use({ method: "DELETE" }),
        "receipt-delete",
        "2026-07-10T12:00:10.000Z"
      )
    ).toMatchObject({ allowed: false, receipt: { riskTier: "destructive", decision: "blocked" } });
  });

  it("revokes leases explicitly and on runtime reset without replenishing usage", () => {
    const state = grantedState();
    const used = authorizeAgentCapability(state, use(), "receipt-used", "2026-07-10T12:00:10.000Z");
    if (!used.required) return;
    const revoked = revokeAgentCapabilityLease(used.state, "lease-1", "Operator changed direction.", "2026-07-10T12:00:20.000Z");
    expect(revoked).toMatchObject({
      ok: true,
      lease: { status: "revoked", usedUses: 1, usedRequests: 1, revocationReason: "Operator changed direction." }
    });
    if (!revoked.ok) return;
    expect(revokeAgentCapabilityLease(revoked.state, "lease-1", "again", NOW)).toMatchObject({ ok: false, error: expect.stringContaining("already revoked") });
    expect(revokeAgentCapabilityLease(revoked.state, "missing", "missing", NOW)).toMatchObject({ ok: false, error: expect.stringContaining("not found") });

    const reset = revokeGrantedAgentCapabilities(grantedState(), "Runtime restarted.", "2026-07-10T12:00:30.000Z");
    expect(reset).toMatchObject({ revision: 3, leases: [expect.objectContaining({ status: "revoked", revocationReason: "Runtime restarted." })] });
    expect(revokeGrantedAgentCapabilities(reset, "again", NOW)).toEqual(reset);
  });

  it("normalizes stored ledgers while dropping malformed and duplicate records", () => {
    const valid = grantedState();
    const authorized = authorizeAgentCapability(valid, use(), "receipt-1", "2026-07-10T12:00:10.000Z");
    if (!authorized.required) return;
    const raw: AgentCapabilityState = {
      ...authorized.state,
      leases: [...authorized.state.leases, authorized.state.leases[0]!, {} as never],
      receipts: [...authorized.state.receipts, authorized.state.receipts[0]!, {} as never]
    };
    const normalized = normalizeAgentCapabilityState(raw, NOW);
    expect(normalized.leases).toHaveLength(1);
    expect(normalized.receipts).toHaveLength(1);
    expect(normalizeAgentCapabilityState({}, NOW)).toEqual(createAgentCapabilityState());
  });
});
