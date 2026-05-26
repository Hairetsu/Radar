import { useCallback, useEffect, useState } from "react";
import { applyTheme, readStoredTheme, storeTheme, type ThemeId } from "../lib/theme";

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readStoredTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

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
