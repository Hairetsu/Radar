import { describe, expect, it } from "vitest";
import { createCausalAttribution } from "./causalAttribution.js";

describe("causal attribution", () => {
  it("exposes only populated evidence provenance fields", () => {
    const attribution = createCausalAttribution();
    attribution.update({ agentRunId: "run-1", actionId: "action-1" });

    expect(attribution.current()).toEqual({ agentRunId: "run-1", actionId: "action-1" });
    expect(attribution.raw()).toMatchObject({ navigationId: "", identityId: "" });
  });

  it("returns snapshots that cannot mutate the owned state", () => {
    const attribution = createCausalAttribution();
    const snapshot = attribution.update({ identityId: "identity-1" });
    snapshot.identityId = "changed";

    expect(attribution.raw().identityId).toBe("identity-1");
  });

  it("clears identity-scoped provenance while preserving the active run", () => {
    const attribution = createCausalAttribution();
    attribution.update({
      agentRunId: "run-1",
      navigationId: "navigation-1",
      actionId: "action-1",
      identityId: "identity-1",
      activationId: "activation-1",
      sequenceRunId: "sequence-1",
      experimentId: "experiment-1"
    });

    attribution.clearIdentityContext();

    expect(attribution.current()).toEqual({ agentRunId: "run-1" });
  });
});
