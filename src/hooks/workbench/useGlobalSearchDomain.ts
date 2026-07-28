import { useCallback, useState } from "react";
import type { GlobalSearchResponse } from "../../types";

export type GlobalSearchDomain = ReturnType<
  typeof useGlobalSearchDomain
>;

export function useGlobalSearchDomain() {
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResult, setGlobalSearchResult] = useState<GlobalSearchResponse | null>(null);
  const [globalSearchPending, setGlobalSearchPending] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState("");

  const runGlobalSearch = useCallback(async (query = globalSearchQuery) => {
    const nextQuery = query.trim();
    setGlobalSearchQuery(query);
    if (!window.radar?.searchGlobal) {
      setGlobalSearchError("Run in Electron to search the local project.");
      setGlobalSearchResult(null);
      return null;
    }
    setGlobalSearchPending(true);
    try {
      const result = await window.radar.searchGlobal({ query: nextQuery, limit: 40 });
      setGlobalSearchResult(result);
      setGlobalSearchError(result.ok ? "" : result.error || "Global search failed.");
      return result;
    } catch (error) {
      setGlobalSearchResult(null);
      setGlobalSearchError(error instanceof Error ? error.message : "Global search failed.");
      return null;
    } finally {
      setGlobalSearchPending(false);
    }
  }, [globalSearchQuery]);

  const openGlobalSearch = useCallback(() => {
    setGlobalSearchOpen(true);
    if (globalSearchQuery.trim() || !globalSearchResult) {
      void runGlobalSearch(globalSearchQuery);
    }
  }, [globalSearchQuery, globalSearchResult, runGlobalSearch]);

  return {
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResult,
    globalSearchPending,
    globalSearchError,
    runGlobalSearch,
    openGlobalSearch
  };
}
