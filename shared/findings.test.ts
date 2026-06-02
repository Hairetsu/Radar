import { describe, expect, it } from "vitest";
import {
  buildFindingReport,
  deleteFinding,
  evidenceRefFromAutomateResult,
  evidenceRefFromCapture,
  evidenceRefFromReplay,
  evidenceRefFromWebSocket,
  findingFromAgentFinding,
  findingFromTemplate,
  normalizeFinding,
  normalizeFindingEvidenceRef,
  normalizeFindings,
  parseFindingEvidenceRef,
  upsertFinding
} from "./findings.js";
import type { AutomateSession, CapturedRequest, ReplayHistoryEntry, WebSocketEvent } from "./domain.js";

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  method: "GET",
  url: "https://example.test/admin",
  host: "example.test",
  path: "/admin",
  requestHeaders: {},
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "text/html",
  type: "document",
  responseHeaders: {},
  responseBody: "",
  durationMs: 42,
  allowed: true,
  source: "proxy"
};

describe("findings", () => {
  it("parses stable evidence refs", () => {
    expect(parseFindingEvidenceRef("capture:cap-1")).toEqual({ kind: "capture", id: "cap-1" });
    expect(parseFindingEvidenceRef("automate:session-1:result-1")).toEqual({
      kind: "automate",
      id: "session-1:result-1"
    });
    expect(parseFindingEvidenceRef("invalid:cap-1")).toBeNull();
  });

  it("requires evidence when normalizing findings", () => {
    expect(normalizeFinding({ title: "No evidence" })).toBeNull();
    expect(normalizeFinding(null)).toBeNull();
    expect(normalizeFindingEvidenceRef(null)).toBeNull();
    expect(normalizeFindingEvidenceRef({ kind: "capture", id: "" })).toBeNull();
    const finding = normalizeFinding({
      title: "Reviewed object access issue",
      severity: "critical",
      confidence: "high",
      status: "reviewed",
      evidence: [evidenceRefFromCapture(capture)]
    });
    expect(finding?.severity).toBe("critical");
    expect(finding?.reviewedAt).toBeTruthy();
    expect(finding?.evidence[0].kind).toBe("capture");
  });

  it("normalizes object evidence refs and arrays of findings", () => {
    const ref = normalizeFindingEvidenceRef({
      id: "ws-1",
      kind: "websocket",
      label: "received frame",
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: { token: "secret", blank: "", nested: { value: true } }
    });
    expect(ref).toEqual({
      id: "ws-1",
      kind: "websocket",
      label: "received frame",
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: { token: "secret", nested: "[object Object]" }
    });
    expect(normalizeFindings([{ title: "Invalid" }, { title: "Valid", evidence: [ref] }])).toHaveLength(1);
  });

  it("creates template-backed draft findings", () => {
    const finding = findingFromTemplate("idor", [evidenceRefFromCapture(capture)]);
    expect(finding.title).toMatch(/Object-level/);
    expect(finding.status).toBe("draft");
    expect(finding.evidence).toHaveLength(1);
  });

  it("builds redacted markdown reports by default", () => {
    const finding = normalizeFinding({
      title: "Sensitive token disclosed",
      status: "reviewed",
      evidence: [
        {
          id: "cap-1",
          kind: "capture",
          label: "GET /me",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { value: "Bearer token-secret" }
        }
      ]
    });
    const report = buildFindingReport(finding ? [finding] : [], { format: "markdown" });
    expect(report.body).toContain("Sensitive token disclosed");
    expect(report.body).toContain("[redacted]");
  });

  it("filters drafts unless requested and can render raw html reports", () => {
    const reviewed = normalizeFinding({
      title: "Reviewed disclosure",
      status: "reviewed",
      evidence: [
        {
          id: "cap-1",
          kind: "capture",
          label: "GET /me",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { value: "ordinary metadata" }
        }
      ],
      retestResult: "Fixed in retest."
    });
    const draft = normalizeFinding({
      title: "Draft issue",
      status: "draft",
      evidence: ["capture:cap-2"]
    });
    const filtered = buildFindingReport([reviewed, draft].filter(Boolean) as NonNullable<typeof reviewed>[], {
      format: "markdown"
    });
    expect(filtered.body).toContain("Reviewed disclosure");
    expect(filtered.body).not.toContain("Draft issue");

    const html = buildFindingReport([reviewed, draft].filter(Boolean) as NonNullable<typeof reviewed>[], {
      format: "html",
      includeDrafts: true,
      includeRawEvidence: true
    });
    expect(html.body).toContain("<h2>Draft issue</h2>");
    expect(html.body).toContain("ordinary metadata");
  });

  it("creates automate evidence references with session context", () => {
    const session = {
      id: "auto-1",
      name: "Role probes",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "completed",
      draft: { method: "GET", url: "https://example.test", headers: {}, body: "" },
      environmentId: "",
      payloads: ["admin"],
      positions: [],
      limits: { count: 1, concurrency: 1, delayMs: 0, timeoutMs: 1000 },
      rules: [],
      clusters: [],
      results: [
        {
          id: "result-1",
          index: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          payload: "admin",
          request: { method: "GET", url: "https://example.test?role=admin", headers: {}, body: "" },
          ok: true,
          status: 200,
          statusText: "OK",
          length: 10,
          latencyMs: 20,
          wordCount: 2,
          headers: {},
          bodyPreview: "ok",
          matchedRules: [],
          extracts: []
        }
      ]
    } satisfies AutomateSession;
    const ref = evidenceRefFromAutomateResult(session, session.results[0]);
    expect(ref.kind).toBe("automate");
    expect(ref.id).toBe("auto-1:result-1");
  });

  it("creates websocket and replay evidence references", () => {
    const event: WebSocketEvent = {
      id: "ws-1",
      requestId: "req-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "wss://example.test/socket",
      host: "example.test",
      direction: "received",
      opcode: 1,
      payloadData: "hello",
      size: 5,
      allowed: true
    };
    const replay: ReplayHistoryEntry = {
      id: "replay-1",
      sentAt: "2026-01-01T00:00:01.000Z",
      draft: { method: "POST", url: "https://example.test/api", headers: {}, body: "{}" },
      result: {
        ok: true,
        status: 201,
        statusText: "Created",
        durationMs: 33,
        headers: {},
        body: "{}",
        bytes: 2
      }
    };
    expect(evidenceRefFromWebSocket(event).metadata.opcode).toBe("1");
    expect(evidenceRefFromReplay(replay).metadata.status).toBe("201");
  });

  it("upserts and deletes findings without mutating unrelated entries", () => {
    const first = normalizeFinding({ title: "First", evidence: ["capture:1"] });
    const second = normalizeFinding({ title: "Second", evidence: ["capture:2"] });
    const renamed = first ? { ...first, title: "First renamed" } : null;
    const upserted = renamed ? upsertFinding([first, second].filter(Boolean) as NonNullable<typeof first>[], renamed) : [];
    expect(upserted[0]?.title).toBe("First renamed");
    expect(deleteFinding(upserted, "capture-missing")).toHaveLength(2);
    expect(deleteFinding(upserted, upserted[0].id)).toHaveLength(1);
  });

  it("converts agent draft findings into durable draft records", () => {
    const finding = findingFromAgentFinding("run-1", {
      id: "agent-finding-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      title: "Missing HSTS",
      confidence: "low",
      evidenceRefs: ["capture:cap-1"],
      notes: "Review manually.",
      uncertainties: ["Only sampled one response."]
    });
    expect(finding?.source).toBe("ai");
    expect(finding?.status).toBe("draft");
    expect(finding?.evidence.map((ref) => ref.kind)).toEqual(["capture", "ai"]);
  });
});
