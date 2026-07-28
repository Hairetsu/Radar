import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedFilter } from "../../types";
import type { WorkView } from "./viewMeta";

interface SavedFiltersDomainPorts {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setTrafficSearch: (query: string) => void;
  setWebSocketSearch: (query: string) => void;
}

export function useSavedFiltersDomain(contextKey: string, ports: SavedFiltersDomainPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const filters = await (window.radar?.getSavedFilters?.() ?? []);
      if (!cancelled) {
        setSavedFilters(filters);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [contextKey]);

  const saveSavedFilter = useCallback(
    async (name: string, query: string, surface: SavedFilter["surface"] = "both") => {
      if (!window.radar?.setSavedFilters) {
        portsRef.current.setNotice("Run in Electron to save filters.");
        return;
      }
      const now = new Date().toISOString();
      const next: SavedFilter[] = [
        {
          id: `filter-${Date.now()}`,
          name: name.trim(),
          query: query.trim(),
          surface,
          createdAt: now,
          updatedAt: now
        },
        ...savedFilters
      ];
      const saved = await window.radar.setSavedFilters(next);
      setSavedFilters(saved);
      portsRef.current.setNotice(`Saved filter: ${name.trim()}`);
    },
    [savedFilters]
  );

  const deleteSavedFilter = useCallback(async (filterId: string) => {
    if (!window.radar?.setSavedFilters) {
      return;
    }
    const saved = await window.radar.setSavedFilters(
      savedFilters.filter((filter) => filter.id !== filterId)
    );
    setSavedFilters(saved);
    portsRef.current.setNotice("Filter deleted");
  }, [savedFilters]);

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    if (filter.surface === "websocket") {
      portsRef.current.setWebSocketSearch(filter.query);
      portsRef.current.setActiveView("websocket");
      return;
    }
    portsRef.current.setTrafficSearch(filter.query);
    portsRef.current.setActiveView("traffic");
  }, []);

  return {
    savedFilters,
    setSavedFilters,
    saveSavedFilter,
    deleteSavedFilter,
    applySavedFilter
  };
}
