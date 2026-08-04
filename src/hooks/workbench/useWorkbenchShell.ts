import { useCallback, useEffect, useState } from "react";
import type { AppMode } from "../../types";
import { viewMeta, type WorkView } from "./viewMeta";

export type WorkbenchShellDomain = ReturnType<typeof useWorkbenchShell>;

export function useWorkbenchShell() {
  const [activeView, setActiveView] = useState<WorkView>("traffic");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [aiPaletteOpen, setAiPaletteOpen] = useState(false);
  const [appMode, setAppModeState] = useState<AppMode>("manual-first");

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!window.radar) {
      return;
    }
    let cancelled = false;
    void window.radar.getAppMode().then((mode) => {
      if (!cancelled) {
        setAppModeState(mode);
      }
    });
    const unsubscribe = window.radar.onAppModeChanged((event) => {
      setAppModeState(event.mode);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const setAppMode = useCallback((mode: AppMode) => {
    if (!window.radar) {
      setAppModeState(mode);
      return;
    }
    void window.radar.setAppMode(mode).then(setAppModeState).catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Radar could not change operating mode.");
    });
  }, []);

  const meta = viewMeta[activeView];
  const utc = clock.toISOString().replace("T", " ").slice(0, 19) + "Z";

  return {
    activeView,
    setActiveView,
    notice,
    setNotice,
    clock,
    utc,
    aiPaletteOpen,
    setAiPaletteOpen,
    appMode,
    setAppMode,
    meta
  };
}
