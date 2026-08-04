import { useCallback, useEffect, useState } from "react";
import { applyTheme, readStoredTheme, storeTheme, type ThemeId } from "../lib/theme";

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readStoredTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    const onStorage = (event: unknown) => {
      if ((event as { key?: string }).key !== "radar.theme") {
        return;
      }
      const next = readStoredTheme();
      setThemeIdState(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeIdState(next);
    storeTheme(next);
    applyTheme(next);
  }, []);

  return {
    themeId,
    setTheme,
    settingsOpen,
    setSettingsOpen
  };
}
