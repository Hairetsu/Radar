import type { CaptureAttributionContext } from "../captureAttribution.js";

type CausalAttributionState = Required<CaptureAttributionContext>;

const EMPTY_ATTRIBUTION: CausalAttributionState = {
  agentRunId: "",
  navigationId: "",
  actionId: "",
  identityId: "",
  activationId: "",
  sequenceRunId: "",
  experimentId: ""
};

export function createCausalAttribution() {
  let state = { ...EMPTY_ATTRIBUTION };

  function update(patch: Partial<CausalAttributionState>) {
    state = { ...state, ...patch };
    return raw();
  }

  function raw(): CausalAttributionState {
    return { ...state };
  }

  function current(): CaptureAttributionContext {
    return Object.fromEntries(
      Object.entries(state).filter(([, value]) => Boolean(value))
    ) as CaptureAttributionContext;
  }

  function clearIdentityContext() {
    return update({
      navigationId: "",
      actionId: "",
      identityId: "",
      activationId: "",
      sequenceRunId: "",
      experimentId: ""
    });
  }

  return { current, raw, update, clearIdentityContext };
}
