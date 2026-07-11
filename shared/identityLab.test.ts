import { describe, expect, it } from "vitest";
import {
  buildIdentityLabMatrix,
  buildIdentityLabSequences,
  compareIdentityLabRequests,
  evaluateIdentityLabInvariant,
  normalizeIdentityLabEvidence,
  normalizeIdentityLabEvidenceList,
  normalizeIdentityLabIdentities,
  normalizeIdentityLabIdentity,
  normalizeIdentityLabInvariant,
  normalizeIdentityLabResource,
  type IdentityLabMatrixRow,
  type IdentityLabRequestEvidence
} from "./identityLab.js";

const PROJECT_ID = "project-acme";
const NOW = "2026-07-10T12:00:00.000Z";

function identity(
  key: string,
  kind: "anonymous" | "user" | "admin" | "service",
  role: string,
  tenant: string
) {
  const normalized = normalizeIdentityLabIdentity(
    {
      key,
      label: key,
      kind,
      role,
      tenant,
      origin: "https://app.target.test",
      health: "ready"
    },
    PROJECT_ID,
    NOW
  );
  if (!normalized) throw new Error("Identity fixture failed to normalize.");
  return normalized;
}

function resource(key: string, tenant: string) {
  const normalized = normalizeIdentityLabResource(
    {
      key,
      label: `Invoice ${key}`,
      type: "invoice",
      tenant,
      url: `https://app.target.test/api/invoices/${key}?token=secret&view=full`
    },
    PROJECT_ID
  );
  if (!normalized) throw new Error("Resource fixture failed to normalize.");
  return normalized;
}

function request(
  key: string,
  identityId: string,
  resourceId: string,
  status: number,
  overrides: Record<string, unknown> = {}
) {
  const normalized = normalizeIdentityLabEvidence(
    {
      kind: "request",
      key,
      identityId,
      resourceId,
      evidenceRef: `capture:${key}`,
      url: `https://app.target.test/api/invoices/${resourceId}?token=secret`,
      method: "GET",
      status,
      responseBytes: 120,
      responseShape: "{id,total}",
      occurredAt: NOW,
      ...overrides
    },
    PROJECT_ID,
    NOW
  );
  if (!normalized || normalized.kind !== "request") throw new Error("Request fixture failed to normalize.");
  return normalized;
}

describe("identityLab", () => {
  it("creates stable project-scoped identity summaries without cookie or storage secret values", () => {
    const input = {
      key: "tenant-a-user",
      label: "Tenant A user",
      kind: "user",
      role: "member",
      tenant: "tenant-a",
      origin: "https://app.target.test/account",
      health: "ready",
      cookies: [
        { name: "sid", value: "cookie-secret" },
        { name: "csrf", value: "csrf-secret" }
      ],
      localStorage: { accessToken: "storage-secret", theme: "dark" },
      sessionStorage: { nonce: "nonce-secret" }
    };
    const first = normalizeIdentityLabIdentity(input, PROJECT_ID, NOW);
    const updated = normalizeIdentityLabIdentity({ ...input, health: "stale" }, PROJECT_ID, "2026-07-10T12:05:00.000Z");
    const otherProject = normalizeIdentityLabIdentity(input, "project-other", NOW);

    expect(first).toMatchObject({
      projectId: PROJECT_ID,
      kind: "user",
      role: "member",
      tenant: "tenant-a",
      origin: "https://app.target.test",
      health: "ready",
      cookieNames: ["csrf", "sid"],
      cookieCount: 2,
      localStorageKeys: ["accessToken", "theme"],
      sessionStorageKeys: ["nonce"]
    });
    expect(updated?.id).toBe(first?.id);
    expect(otherProject?.id).not.toBe(first?.id);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("cookie-secret");
    expect(serialized).not.toContain("storage-secret");
    expect(serialized).not.toContain("nonce-secret");
  });

  it("fails closed on malformed identities and deduplicates normalized project identities", () => {
    expect(normalizeIdentityLabIdentity({ kind: "owner", origin: "https://app.test" }, PROJECT_ID, NOW)).toBeNull();
    expect(normalizeIdentityLabIdentity({ kind: "user", origin: "file:///tmp/data" }, PROJECT_ID, NOW)).toBeNull();
    expect(normalizeIdentityLabIdentity({ kind: "user", origin: "https://app.test" }, "", NOW)).toBeNull();

    const values = normalizeIdentityLabIdentities(
      [
        { key: "same", kind: "anonymous", origin: "https://app.test", health: "bogus" },
        { key: "same", kind: "anonymous", origin: "https://app.test", health: "ready" },
        null
      ],
      PROJECT_ID,
      NOW
    );
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ kind: "anonymous", role: "anonymous", tenant: "unknown", health: "unknown" });
  });

  it("normalizes identity-attributed request and action evidence without URL values or raw response shapes", () => {
    const user = identity("user-a", "user", "member", "tenant-a");
    const invoice = resource("817", "tenant-a");
    const evidence = normalizeIdentityLabEvidenceList(
      [
        {
          kind: "request",
          key: "request-1",
          identityId: user.id,
          resourceId: invoice.id,
          evidenceRefs: ["capture:1", "capture:1"],
          url: "https://app.target.test/api/invoices/817?token=top-secret&view=full",
          method: "get",
          status: 200,
          responseBytes: 9_999_999_999,
          responseShape: "top-secret-response-shape",
          requestHeaders: { Authorization: "Bearer secret" },
          requestBody: "secret-body",
          sequenceId: "checkout",
          sequenceIndex: 999_999,
          stateBefore: "draft",
          stateAfter: "submitted"
        },
        {
          kind: "action",
          key: "action-1",
          identityId: user.id,
          resourceId: invoice.id,
          evidenceRef: "ai:run:step",
          url: "https://app.target.test/api/invoices/817?csrf=secret",
          action: "submit",
          outcome: "succeeded",
          label: "Submit invoice",
          value: "input-secret",
          sequenceId: "checkout",
          sequenceIndex: 1
        },
        { kind: "request", identityId: user.id, resourceId: invoice.id, url: "not-a-url" }
      ],
      PROJECT_ID,
      NOW
    );

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      kind: "request",
      method: "GET",
      path: "/api/invoices/817",
      queryKeys: ["token", "view"],
      responseBytes: 1_000_000_000,
      sequenceIndex: 100_000
    });
    expect((evidence[0] as IdentityLabRequestEvidence).responseShapeHash).not.toContain("top-secret");
    expect(evidence[1]).toMatchObject({ kind: "action", action: "submit", method: "POST", outcome: "succeeded" });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("secret-body");
    expect(serialized).not.toContain("input-secret");
  });

  it("builds role by tenant by resource rows with observed and not-observed access", () => {
    const userA = identity("user-a", "user", "member", "tenant-a");
    const userB = identity("user-b", "user", "member", "tenant-b");
    const adminA = identity("admin-a", "admin", "admin", "tenant-a");
    const invoiceA = resource("invoice-a", "tenant-a");
    const invoiceB = resource("invoice-b", "tenant-b");
    const evidence = [
      request("req-a", userA.id, invoiceA.id, 200),
      request("req-cross", userB.id, invoiceA.id, 403),
      request("req-admin", adminA.id, invoiceB.id, 200)
    ];

    const rows = buildIdentityLabMatrix(PROJECT_ID, [userA, userB, adminA], [invoiceA, invoiceB], evidence);
    const memberAInvoice = rows.find(
      (row) => row.role === "member" && row.tenant === "tenant-a" && row.resourceId === invoiceA.id
    );
    const memberBInvoice = rows.find(
      (row) => row.role === "member" && row.tenant === "tenant-b" && row.resourceId === invoiceA.id
    );
    const unseen = rows.find(
      (row) => row.role === "member" && row.tenant === "tenant-a" && row.resourceId === invoiceB.id
    );
    expect(rows).toHaveLength(6);
    expect(memberAInvoice).toMatchObject({ observation: "observed", access: "allowed", sameTenant: true });
    expect(memberBInvoice).toMatchObject({ observation: "observed", access: "denied", sameTenant: false });
    expect(unseen).toMatchObject({ observation: "not-observed", access: "not-observed", requestCount: 0 });
  });

  it("evaluates invariants into observed, not-observed, violated, and insufficient states", () => {
    const base = normalizeIdentityLabInvariant(
      {
        key: "tenant-isolation",
        title: "Members cannot read another tenant's invoice",
        role: "member",
        tenant: "tenant-b",
        resourceId: "resource-invoice-a",
        expected: "deny"
      },
      PROJECT_ID,
      NOW
    );
    if (!base) throw new Error("Invariant fixture failed to normalize.");
    const row = (access: IdentityLabMatrixRow["access"], refs: string[] = ["capture:1"]): IdentityLabMatrixRow => ({
      id: `matrix-${access}`,
      projectId: PROJECT_ID,
      role: "member",
      tenant: "tenant-b",
      identityIds: ["identity-b"],
      resourceId: "resource-invoice-a",
      resourceLabel: "Invoice A",
      resourceTenant: "tenant-a",
      sameTenant: false,
      origin: "https://app.target.test",
      path: "/api/invoices/a",
      observation: "observed",
      access,
      requestCount: 1,
      statusCodes: [],
      outcomes: [],
      evidenceRefs: refs
    });

    expect(evaluateIdentityLabInvariant(base, [row("denied")], NOW).state).toBe("observed");
    expect(evaluateIdentityLabInvariant(base, [], NOW).state).toBe("not-observed");
    expect(evaluateIdentityLabInvariant(base, [row("allowed")], NOW).state).toBe("violated");
    expect(evaluateIdentityLabInvariant(base, [row("insufficient", [])], NOW).state).toBe("insufficient");
    expect(
      normalizeIdentityLabInvariant(
        { ...base, key: "unsupported", state: "violated", evidenceRefs: [] },
        PROJECT_ID,
        NOW
      )
    ).toMatchObject({ state: "insufficient" });
  });

  it("orders sequences, summarizes transitions, and detects incomplete ordering", () => {
    const user = identity("sequence-user", "user", "member", "tenant-a");
    const invoice = resource("sequence-invoice", "tenant-a");
    const evidence = normalizeIdentityLabEvidenceList(
      [
        {
          kind: "request",
          key: "step-2",
          identityId: user.id,
          resourceId: invoice.id,
          evidenceRef: "capture:2",
          url: "https://app.target.test/api/invoices/sequence-invoice",
          status: 200,
          sequenceId: "approve-flow",
          sequenceIndex: 2,
          stateBefore: "submitted",
          stateAfter: "approved",
          occurredAt: "2026-07-10T12:00:02.000Z"
        },
        {
          kind: "action",
          key: "step-1",
          identityId: user.id,
          resourceId: invoice.id,
          evidenceRef: "ai:run:1",
          url: "https://app.target.test/api/invoices/sequence-invoice",
          action: "submit",
          outcome: "succeeded",
          sequenceId: "approve-flow",
          sequenceIndex: 1,
          stateBefore: "draft",
          stateAfter: "submitted",
          occurredAt: "2026-07-10T12:00:01.000Z"
        }
      ],
      PROJECT_ID,
      NOW
    );
    const summary = buildIdentityLabSequences(PROJECT_ID, evidence)[0];
    expect(summary).toMatchObject({
      sequenceId: "approve-flow",
      ordered: true,
      initialState: "draft",
      finalState: "approved"
    });
    expect(summary?.steps.map((step) => step.index)).toEqual([1, 2]);
    expect(summary?.transitions.map((transition) => `${transition.fromState}->${transition.toState}`)).toEqual([
      "draft->submitted",
      "submitted->approved"
    ]);

    const incomplete = evidence.map((item, index) => (index === 1 ? { ...item, sequenceIndex: 4 } : item));
    expect(buildIdentityLabSequences(PROJECT_ID, incomplete)[0]?.ordered).toBe(false);
  });

  it("compares secret-free request summaries across identities and fails closed across projects or targets", () => {
    const userA = identity("diff-a", "user", "member", "tenant-a");
    const userB = identity("diff-b", "user", "member", "tenant-b");
    const invoice = resource("diff-invoice", "tenant-a");
    const left = request("diff-left", userA.id, invoice.id, 200, {
      responseBytes: 120,
      responseShape: "{id,total}",
      stateAfter: "visible"
    });
    const equivalent = request("diff-equivalent", userB.id, invoice.id, 200, {
      responseBytes: 120,
      responseShape: "{id,total}",
      stateAfter: "visible"
    });
    const different = request("diff-right", userB.id, invoice.id, 403, {
      responseBytes: 30,
      responseShape: "{error}",
      stateAfter: "denied"
    });

    expect(compareIdentityLabRequests(left, equivalent)).toMatchObject({ state: "equivalent", differences: [] });
    expect(compareIdentityLabRequests(left, different)).toMatchObject({
      state: "different",
      differences: expect.arrayContaining(["outcome", "status", "response-bytes", "response-shape", "state"])
    });
    expect(compareIdentityLabRequests(left, { ...different, identityId: left.identityId })).toMatchObject({
      state: "insufficient"
    });
    expect(compareIdentityLabRequests(left, { ...different, projectId: "project-other" })).toBeNull();
    expect(compareIdentityLabRequests(left, { ...different, path: "/different" })).toMatchObject({
      state: "insufficient"
    });
  });
});
