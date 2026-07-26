import { useCallback, useEffect, useState } from "react";
import type { AppMode } from "../../types";
import { viewMeta, type WorkView } from "./viewMeta";

function storedAppMode(): AppMode {
  if (typeof window === "undefined") {
    return "manual-first";
  }
  return window.localStorage.getItem("radar.appMode") === "ai-first" ? "ai-first" : "manual-first";
}

export type WorkbenchShellDomain = ReturnType<typeof useWorkbenchShell>;

export function useWorkbenchShell() {
  const [activeView, setActiveView] = useState<WorkView>("traffic");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [aiPaletteOpen, setAiPaletteOpen] = useState(false);
  const [appMode, setAppModeState] = useState<AppMode>(storedAppMode);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const setAppMode = useCallback((mode: AppMode) => {
    setAppModeState(mode);
    window.localStorage.setItem("radar.appMode", mode);
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
