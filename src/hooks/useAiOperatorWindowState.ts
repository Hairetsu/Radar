import { useEffect, useState } from "react";
import type { AiOperatorWindowState } from "../../shared/windowCoordination.js";

const CLOSED_STATE: AiOperatorWindowState = {
  created: false,
  visible: false,
  focused: false,
  section: "runs"
};

export function useAiOperatorWindowState() {
  const [state, setState] = useState<AiOperatorWindowState>(CLOSED_STATE);

  useEffect(() => {
    if (!window.radar) {
      return;
    }
    let cancelled = false;
    void window.radar.getAiOperatorWindowState().then((next) => {
      if (!cancelled) setState(next);
    });
    const unsubscribe = window.radar.onAiOperatorWindowState(setState);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}

