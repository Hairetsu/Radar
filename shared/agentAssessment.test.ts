import { describe, expect, it } from "vitest";
import {
  applyEncodingChain,
  applyProbeMutation,
  authorityAllowsFamily,
  classifyEndpointImpact,
  classifyReplayExperiment,
  consumeReservedProbeCost,
  contractAllowsFamily,
  contractAllowsPath,
  corsOriginPayloads,
  createArmedAssessmentState,
  defaultAssessmentContract,
  emptyProbeLedger,
  experimentRequestCost,
  familyAllowsMethod,
  familyAllowsMutation,
  getProbeFamily,
  impactAllowsReadOnlyProbes,
  injectionSignalPayloads,
  isProbeFamilyId,
  mutationPayloadBytes,
  normalizeAssessmentContract,
  normalizeProbeMutation,
  normalizeReplayExperimentRequest,
  originStayedFixed,
  originalValueHash,
  rankAssessmentCandidates,
  readMutationValue,
  releaseReservedProbeCost,
  remainingProbeBudget,
  reserveProbeCost,
  summarizeExperimentClassification,
  variantMutationsForFamily
} from "./agentAssessment.js";
import { UNTRUSTED_CORS_ORIGIN } from "./agentAssessment/constants.js";
import type { CapturedRequest } from "./domain.js";
import type { ReplayDiffSummary } from "./replayDiff.js";

function capture(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "cap-search",
    startedAt: "2026-08-22T00:00:00.000Z",
    method: "GET",
    url: "http://127.0.0.1:3000/api/cargo-search?q=alpha",
    host: "127.0.0.1:3000",
    path: "/api/cargo-search",
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "xhr",
    responseHeaders: {},
    responseBody: "{}",
    durationMs: 12,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

function diff(overrides: Partial<ReplayDiffSummary> = {}): ReplayDiffSummary {
  return {
    statusChanged: false,
    statusBefore: 200,
    statusAfter: 200,
    latencyDeltaMs: 0,
    bodyLengthBefore: 2,
    bodyLengthAfter: 2,
    bodyLengthDelta: 0,
    headerDiffs: [],
    bodyTextDiff: [],
    jsonDiffs: [],
    identical: true,
    ...overrides
  };
}

describe("agentAssessment", () => {
  it("classifies Harborline-style endpoints without treating GET lookups as state-changing", () => {
    expect(classifyEndpointImpact({ method: "GET", path: "/api/cargo-search" })).toBe("read-only");
    expect(classifyEndpointImpact({ method: "GET", path: "/invoices/12" })).toBe("read-only");
    expect(classifyEndpointImpact({ method: "OPTIONS", path: "/api/preview" })).toBe("read-only");
    expect(classifyEndpointImpact({ method: "POST", path: "/profile/update" })).toBe("state-changing");
    expect(classifyEndpointImpact({ method: "POST", path: "/login" })).toBe("authentication");
    expect(classifyEndpointImpact({ method: "POST", path: "/unknown" })).toBe("unknown");
  });

  it("keeps mutations on the captured origin and records query replacements", () => {
    const draft = {
      method: "GET",
      url: "http://127.0.0.1:3000/api/cargo-search?q=alpha",
      headers: { Authorization: "Bearer secret" },
      body: ""
    };
    const mutated = applyProbeMutation(draft, { kind: "replace-query", name: "q", value: "'" });
    expect(originStayedFixed(draft, mutated)).toBe(true);
    expect(mutated.url).toContain("q=%27");
    const stripped = applyProbeMutation(draft, { kind: "remove-authorization" });
    expect(stripped.headers.Authorization).toBeUndefined();
  });

  it("rejects contract expansion into unapproved families or observe-level sends", () => {
    const contract = normalizeAssessmentContract({
      authorityLevel: "read-only-probes",
      families: ["cors-origin", "ssrf-destination", "injection-signal"]
    });
    expect(contract?.families).toEqual(["cors-origin", "injection-signal"]);
    expect(contractAllowsFamily(contract!, "cors-origin")).toBe(true);
    expect(normalizeAssessmentContract({ authorityLevel: "observe", families: ["cors-origin"] })?.maxProbeRequests).toBe(0);
    expect(normalizeAssessmentContract({ families: ["not-a-family"] })).toBeNull();
  });

  it("ranks in-scope read-only captures and skips state-changing profile updates", () => {
    const contract = defaultAssessmentContract();
    const ranked = rankAssessmentCandidates({
      contract,
      covered: [],
      captures: [
        capture(),
        capture({
          id: "cap-profile",
          method: "POST",
          url: "http://127.0.0.1:3000/profile/update",
          path: "/profile/update"
        }),
        capture({ id: "cap-out", allowed: false })
      ]
    });
    expect(ranked.map((item) => item.captureId)).toEqual(["cap-search"]);
    expect(ranked[0]?.applicableFamilies).toEqual(expect.arrayContaining(["injection-signal", "reflection-context"]));
  });

  it("reserves the full experiment cost instead of hiding variants behind one request", () => {
    expect(experimentRequestCost(2)).toBe(3);
    const reserved = reserveProbeCost({ reserved: 0, consumed: 38, receipts: [] }, 3, 40);
    expect(reserved.ok).toBe(false);
    const ok = reserveProbeCost({ reserved: 0, consumed: 10, receipts: [] }, 3, 40);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(remainingProbeBudget(ok.ledger, 40)).toBe(27);
    }
  });

  it("classifies injection as verification-required only when the control pair diverges", () => {
    const result = classifyReplayExperiment({
      family: "injection-signal",
      baselineStatus: 200,
      baselineBody: '{"ok":true}',
      variants: [
        { payload: "'", status: 500, body: "syntax", headers: {}, comparison: diff({ identical: false, statusChanged: true }) },
        { payload: "' OR '1'='1", status: 200, body: '{"rows":2}', headers: {}, comparison: diff({ identical: false }) }
      ]
    });
    expect(result.classification).toBe("verification-required");
    const cors = classifyReplayExperiment({
      family: "cors-origin",
      baselineStatus: 200,
      baselineBody: "",
      variants: [
        {
          payload: UNTRUSTED_CORS_ORIGIN,
          status: 200,
          body: "",
          headers: {
            "Access-Control-Allow-Origin": UNTRUSTED_CORS_ORIGIN,
            "Access-Control-Allow-Credentials": "true"
          },
          comparison: diff({ identical: false })
        }
      ]
    });
    expect(cors.classification).toBe("verification-required");
  });

  it("builds family mutations from a capture location and rejects mismatched kinds", () => {
    const injection = variantMutationsForFamily({
      family: "injection-signal",
      location: { kind: "replace-query", name: "q", value: "alpha" },
      canaryId: "exp1"
    });
    expect(injection).toHaveLength(2);
    expect(familyAllowsMutation("authorization-omission", { kind: "remove-authorization" })).toBe(true);
    expect(familyAllowsMutation("authorization-omission", { kind: "set-origin", value: "https://evil.test" })).toBe(false);
    expect(
      normalizeReplayExperimentRequest({
        captureId: "cap-search",
        family: "cors-origin",
        location: { kind: "replace-query", name: "q", value: "x" }
      })
    ).toBeNull();
  });

  it("does not let raw context or external callbacks sneak into a default contract", () => {
    const contract = normalizeAssessmentContract({
      allowRawContext: true,
      externalInteraction: "https://callback.example",
      maxConcurrency: 8,
      families: ["cors-origin"]
    });
    expect(contract?.allowRawContext).toBe(false);
    expect(contract?.externalInteraction).toBe("none");
    expect(contract?.maxConcurrency).toBe(1);
  });

  it("covers remaining mutation, encoding, and origin helpers", () => {
    const draft = {
      method: "POST",
      url: "http://127.0.0.1:3000/api/items/12?q=alpha",
      headers: { Authorization: "Bearer secret", Cookie: "sid=abc; role=user", Origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ q: "alpha", nested: { id: 12 } })
    };
    expect(applyEncodingChain("a b", ["url"])).toContain("%20");
    expect(applyEncodingChain('a"b', ["json-escape"])).toContain('\\"');
    expect(applyEncodingChain("hi", ["base64"])).toBe(btoa("hi"));
    expect(applyEncodingChain("Ab", ["case-variation"])).toBe("AB");
    expect(applyEncodingChain("AB", ["case-variation"])).toBe("ab");
    expect(applyProbeMutation(draft, { kind: "append-query", name: "extra", value: "1" }).url).toContain("extra=1");
    expect(applyProbeMutation(draft, { kind: "remove-query", name: "q" }).url).not.toContain("q=alpha");
    expect(JSON.parse(applyProbeMutation(draft, { kind: "replace-json", path: "nested.id", value: "99" }).body)).toMatchObject({ nested: { id: "99" } });
    expect(applyProbeMutation({ ...draft, body: "q=alpha" }, { kind: "replace-form", name: "q", value: "z" }).body).toContain("q=z");
    expect(applyProbeMutation(draft, { kind: "replace-header", name: "x-test", value: "1" }).headers["x-test"]).toBe("1");
    expect(applyProbeMutation(draft, { kind: "replace-cookie", name: "role", value: "admin" }).headers.Cookie).toContain("role=admin");
    expect(applyProbeMutation(draft, { kind: "replace-path-segment", index: 2, value: "99" }).url).toContain("/items/99");
    expect(applyProbeMutation(draft, { kind: "set-origin", value: "" }).headers.Origin).toBe("");
    expect(applyProbeMutation(draft, { kind: "set-host", value: "evil.test" }).headers.Host).toBe("evil.test");
    expect(applyProbeMutation(draft, { kind: "set-method", value: "get" })).toMatchObject({ method: "GET", body: "" });
    expect(readMutationValue(draft, { kind: "replace-query", name: "q", value: "" })).toBe("alpha");
    expect(readMutationValue(draft, { kind: "replace-json", path: "nested.id", value: "" })).toBe("12");
    expect(readMutationValue({ ...draft, body: "q=alpha" }, { kind: "replace-form", name: "q", value: "" })).toBe("alpha");
    expect(readMutationValue(draft, { kind: "replace-header", name: "authorization", value: "" })).toBe("Bearer secret");
    expect(readMutationValue(draft, { kind: "replace-cookie", name: "sid", value: "" })).toBe("abc");
    expect(readMutationValue(draft, { kind: "replace-path-segment", index: 2, value: "" })).toBe("12");
    expect(readMutationValue(draft, { kind: "remove-authorization" })).toBe("Bearer secret");
    expect(readMutationValue(draft, { kind: "set-origin", value: "" })).toBe("http://127.0.0.1:3000");
    expect(readMutationValue(draft, { kind: "set-host", value: "" })).toBe("127.0.0.1:3000");
    expect(readMutationValue(draft, { kind: "set-method", value: "" })).toBe("POST");
    expect(readMutationValue({ ...draft, body: "{" }, { kind: "replace-json", path: "q", value: "" })).toBe("");
    expect(originalValueHash(draft, { kind: "replace-query", name: "q", value: "" })).toMatch(/^h1:/);
    expect(mutationPayloadBytes({ kind: "replace-query", name: "q", value: "abc" })).toBe(3);
    expect(mutationPayloadBytes({ kind: "remove-authorization" })).toBe(0);
    expect(originStayedFixed(draft, { ...draft, url: "not-a-url" })).toBe(false);
    expect(() => applyProbeMutation(draft, { kind: "replace-path-segment", index: 9, value: "x" })).toThrow(/outside the captured path/);
  });

  it("classifies every first-wave family including negatives and incomplete pairs", () => {
    expect(classifyReplayExperiment({ family: "cors-origin", baselineStatus: 200, baselineBody: "", variants: [] }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "cors-origin",
      baselineStatus: 200,
      baselineBody: "",
      variants: [{ payload: "", status: 200, body: "", headers: {}, comparison: diff() }]
    }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "cors-origin",
      baselineStatus: 200,
      baselineBody: "",
      variants: [{ payload: UNTRUSTED_CORS_ORIGIN, status: 200, body: "", headers: { "access-control-allow-origin": UNTRUSTED_CORS_ORIGIN }, comparison: diff({ identical: false }) }]
    }).classification).toBe("supported");
    expect(classifyReplayExperiment({
      family: "cors-origin",
      baselineStatus: 200,
      baselineBody: "",
      variants: [{ payload: UNTRUSTED_CORS_ORIGIN, status: 200, body: "", headers: {}, comparison: diff() }]
    }).classification).toBe("negative");
    expect(classifyReplayExperiment({
      family: "cors-origin",
      baselineStatus: 200,
      baselineBody: "",
      variants: [{ payload: UNTRUSTED_CORS_ORIGIN, status: 204, body: "", headers: { vary: "Origin" }, comparison: diff({ identical: false, statusChanged: true }) }]
    }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "reflection-context",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "radar-canary-a", status: 200, body: "ok", headers: {}, comparison: diff() }]
    }).classification).toBe("negative");
    expect(classifyReplayExperiment({
      family: "reflection-context",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "radar-canary-a", status: 200, body: "radar-canary-a", headers: {}, comparison: diff({ identical: false }) }]
    }).classification).toBe("supported");
    expect(classifyReplayExperiment({
      family: "injection-signal",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "'", status: 500, body: "err", headers: {}, comparison: diff({ identical: false }) }]
    }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "injection-signal",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [
        { payload: "'", status: 200, body: "ok", headers: {}, comparison: diff() },
        { payload: "' OR '1'='1", status: 200, body: "ok", headers: {}, comparison: diff() }
      ]
    }).classification).toBe("negative");
    expect(classifyReplayExperiment({
      family: "injection-signal",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [
        { payload: "'", status: 500, body: "err", headers: {}, comparison: diff({ identical: false }) },
        { payload: "' OR '1'='1", status: 500, body: "err", headers: {}, comparison: diff({ identical: false }) }
      ]
    }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "authorization-omission",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "", status: 401, body: "no", headers: {}, comparison: diff({ identical: false, statusChanged: true }) }]
    }).classification).toBe("negative");
    expect(classifyReplayExperiment({
      family: "authorization-omission",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "", status: 200, body: "ok", headers: {}, comparison: diff() }]
    }).classification).toBe("supported");
    expect(classifyReplayExperiment({
      family: "authorization-omission",
      baselineStatus: 200,
      baselineBody: "ok",
      variants: [{ payload: "", status: 500, body: "err", headers: {}, comparison: diff({ identical: false }) }]
    }).classification).toBe("inconclusive");
    expect(classifyReplayExperiment({
      family: "resource-id",
      baselineStatus: 200,
      baselineBody: "mine",
      variants: [{ payload: "99", status: 404, body: "no", headers: {}, comparison: diff({ identical: false, statusChanged: true }) }]
    }).classification).toBe("negative");
    expect(classifyReplayExperiment({
      family: "resource-id",
      baselineStatus: 200,
      baselineBody: "mine",
      variants: [{ payload: "99", status: 200, body: "theirs", headers: {}, comparison: diff({ identical: false }) }]
    }).classification).toBe("verification-required");
    expect(classifyReplayExperiment({
      family: "resource-id",
      baselineStatus: 200,
      baselineBody: "mine",
      variants: [{ payload: "99", status: 200, body: "mine", headers: {}, comparison: diff() }]
    }).classification).toBe("inconclusive");
    expect(summarizeExperimentClassification({ classification: "negative", rationale: "no change", requestCost: 2 })).toContain("negative");
  });

  it("normalizes mutations and family variant builders", () => {
    expect(normalizeProbeMutation({ kind: "replace-query", name: "q", value: "x", encoding: ["url", "nope"] })).toEqual({
      kind: "replace-query",
      name: "q",
      value: "x",
      encoding: ["url"]
    });
    expect(normalizeProbeMutation({ kind: "remove-query", name: "q" })).toEqual({ kind: "remove-query", name: "q" });
    expect(normalizeProbeMutation({ kind: "replace-json", path: "user.id", value: "1" })?.kind).toBe("replace-json");
    expect(normalizeProbeMutation({ kind: "replace-path-segment", index: 1, value: "2" })).toEqual({
      kind: "replace-path-segment",
      index: 1,
      value: "2"
    });
    expect(normalizeProbeMutation({ kind: "remove-authorization" })).toEqual({ kind: "remove-authorization" });
    expect(normalizeProbeMutation({ kind: "set-origin", value: "" })).toEqual({ kind: "set-origin", value: "" });
    expect(normalizeProbeMutation({ kind: "set-host" })).toBeNull();
    expect(normalizeProbeMutation({ kind: "unknown" })).toBeNull();
    expect(normalizeReplayExperimentRequest({
      captureId: "cap-1",
      family: "injection-signal",
      hypothesis: "pair",
      location: { kind: "replace-query", name: "q", value: "" },
      values: ["'", "' OR '1'='1"],
      encoding: ["url"],
      tabId: "tab-1",
      identity: "current"
    })).toMatchObject({ family: "injection-signal", tabId: "tab-1", identity: "current" });
    expect(variantMutationsForFamily({
      family: "cors-origin",
      location: { kind: "set-origin", value: "" },
      expectedOrigin: "http://127.0.0.1:3000",
      canaryId: "exp"
    })).toHaveLength(3);
    expect(variantMutationsForFamily({
      family: "reflection-context",
      location: { kind: "replace-query", name: "q", value: "" },
      canaryId: "exp 1!"
    })[0]).toMatchObject({ value: "radar-canary-exp1" });
    expect(variantMutationsForFamily({
      family: "reflection-context",
      location: { kind: "replace-json", path: "q", value: "" },
      canaryId: "exp"
    })).toHaveLength(1);
    expect(variantMutationsForFamily({
      family: "reflection-context",
      location: { kind: "remove-authorization" },
      canaryId: "exp"
    })).toEqual([]);
    expect(variantMutationsForFamily({
      family: "injection-signal",
      location: { kind: "replace-json", path: "q", value: "" },
      values: ["a", "b"],
      canaryId: "exp"
    })).toHaveLength(2);
    expect(variantMutationsForFamily({
      family: "injection-signal",
      location: { kind: "set-origin", value: "" },
      canaryId: "exp"
    })).toEqual([]);
    expect(variantMutationsForFamily({
      family: "authorization-omission",
      location: { kind: "remove-authorization" },
      canaryId: "exp"
    })).toEqual([{ kind: "remove-authorization" }]);
    expect(variantMutationsForFamily({
      family: "resource-id",
      location: { kind: "replace-path-segment", index: 1, value: "" },
      observedIds: ["12", "99"],
      canaryId: "exp"
    })).toHaveLength(2);
    expect(variantMutationsForFamily({
      family: "resource-id",
      location: { kind: "set-origin", value: "" },
      values: ["12"],
      canaryId: "exp"
    })).toEqual([]);
    expect(familyAllowsMethod("cors-origin", "options")).toBe(true);
    expect(familyAllowsMethod("cors-origin", "POST")).toBe(false);
    expect(authorityAllowsFamily("observe", "cors-origin")).toBe(false);
    expect(authorityAllowsFamily("read-only-probes", "cors-origin")).toBe(true);
    expect(getProbeFamily("cors-origin").label).toContain("CORS");
    expect(isProbeFamilyId("nope")).toBe(false);
    expect(corsOriginPayloads("https://app.test")).toEqual(["", "https://app.test", UNTRUSTED_CORS_ORIGIN]);
    expect(injectionSignalPayloads()).toEqual(["'", "' OR '1'='1"]);
  });

  it("enforces path exclusions, ledger consume/release, and candidate filters", () => {
    const contract = normalizeAssessmentContract({
      families: ["injection-signal", "resource-id"],
      includedPathPrefixes: ["api"],
      excludedPathPrefixes: ["/api/admin"],
      evidenceSeedCaptureIds: ["cap-search", "cap-json", "cap-form", "cap-bad"],
      identity: "reviewer"
    });
    expect(contract).not.toBeNull();
    expect(contractAllowsPath(contract!, "api/cargo-search")).toBe(true);
    expect(contractAllowsPath(contract!, "/api/admin/users")).toBe(false);
    expect(contractAllowsFamily(contract!, "cors-origin")).toBe(false);
    expect(createArmedAssessmentState(contract!).status).toBe("armed");
    expect(emptyProbeLedger()).toEqual({ reserved: 0, consumed: 0, receipts: [] });
    expect(experimentRequestCost(-2)).toBe(1);
    expect(reserveProbeCost(emptyProbeLedger(), 0, 40).ok).toBe(false);
    const reserved = reserveProbeCost(emptyProbeLedger(), 3, 40);
    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      const consumed = consumeReservedProbeCost(reserved.ledger, 3, [{
        id: "probe-1",
        experimentId: "exp-1",
        family: "injection-signal",
        sourceCaptureId: "cap-search",
        origin: "http://127.0.0.1:3000",
        method: "GET",
        path: "/api/cargo-search",
        identity: "current",
        role: "baseline",
        payloadBytes: 0,
        historyId: "hist-1",
        createdAt: "2026-08-22T00:00:00.000Z"
      }]);
      expect(consumed.consumed).toBe(3);
      expect(consumed.reserved).toBe(0);
      expect(releaseReservedProbeCost(reserved.ledger, 3).reserved).toBe(0);
    }
    expect(classifyEndpointImpact({ method: "", path: "" })).toBe("unknown");
    expect(classifyEndpointImpact({ method: "DELETE", path: "/x" })).toBe("state-changing");
    expect(classifyEndpointImpact({ method: "GET", path: "/login" })).toBe("authentication");
    expect(classifyEndpointImpact({ method: "POST", path: "/api/preview" })).toBe("read-only");
    expect(classifyEndpointImpact({ method: "PUT", path: "/item" })).toBe("state-changing");
    expect(impactAllowsReadOnlyProbes("unknown")).toBe(false);
    const ranked = rankAssessmentCandidates({
      contract: contract!,
      covered: [{ captureId: "cap-search", family: "injection-signal" }],
      captures: [
        capture(),
        capture({
          id: "cap-json",
          url: "http://127.0.0.1:3000/api/cargo-search",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: "{\"q\":\"alpha\"}"
        }),
        capture({
          id: "cap-form",
          url: "http://127.0.0.1:3000/api/cargo-search",
          requestHeaders: { "content-type": "application/x-www-form-urlencoded" },
          requestBody: "q=alpha"
        }),
        capture({ id: "cap-bad", url: "not-a-url", path: "/api/cargo-search" }),
        capture({ id: "cap-admin", path: "/api/admin", url: "http://127.0.0.1:3000/api/admin" }),
        capture({ id: "cap-other", path: "/other", url: "http://127.0.0.1:3000/other" })
      ]
    });
    expect(ranked.map((item) => item.captureId)).toEqual(expect.arrayContaining(["cap-search", "cap-json", "cap-form"]));
    expect(ranked.find((item) => item.captureId === "cap-json")?.parameterNames).toContain("q");
    expect(normalizeAssessmentContract("nope")).toBeNull();
    expect(normalizeAssessmentContract({ authorityLevel: "explode" })).toBeNull();
    expect(defaultAssessmentContract({ identity: "lab", includedPathPrefixes: ["/api"], seedCaptureIds: ["cap-1"] }).identity).toBe("lab");
  });
});
