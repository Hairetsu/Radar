import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAllowedTarget } from "../../lib";
import { endpointInventoryForNode } from "../../../shared/endpointInventory.js";
import { diffSessionCaptures, type SessionDiffResult } from "../../../shared/sessionDiff.js";
import { buildSitemap, sitemapQueryForNode, type SitemapNode } from "../../../shared/sitemap.js";
import type { CapturedRequest, LocalContext } from "../../types";
import type { WorkView } from "./viewMeta";

interface SitemapDomainPorts {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setTrafficSearch: (query: string) => void;
}

export function useSitemapDomain(
  captures: CapturedRequest[],
  targets: string[],
  localContext: LocalContext | null,
  ports: SitemapDomainPorts
) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [selectedSitemapNodeId, setSelectedSitemapNodeId] = useState("");
  const [diffBaselineSessionId, setDiffBaselineSessionId] = useState("");
  const [sessionDiff, setSessionDiff] = useState<SessionDiffResult | null>(null);
  const [sessionDiffPending, setSessionDiffPending] = useState(false);

  useEffect(() => {
    setSelectedSitemapNodeId("");
    setDiffBaselineSessionId("");
    setSessionDiff(null);
  }, [localContext?.session.id]);

  const sitemap = useMemo(() => buildSitemap(captures), [captures]);

  const selectedSitemapNode = useMemo(() => {
    if (!selectedSitemapNodeId) {
      return null;
    }
    return sitemap.nodes[selectedSitemapNodeId] || null;
  }, [selectedSitemapNodeId, sitemap.nodes]);

  const selectedSitemapInventory = useMemo(() => {
    if (!selectedSitemapNode) {
      return null;
    }
    return endpointInventoryForNode(selectedSitemapNode, captures);
  }, [captures, selectedSitemapNode]);

  const applySitemapNode = useCallback((node: SitemapNode) => {
    setSelectedSitemapNodeId(node.id);
    portsRef.current.setTrafficSearch(sitemapQueryForNode(node));
    portsRef.current.setActiveView("traffic");
  }, []);

  const runSessionDiff = useCallback(async () => {
    if (!window.radar?.getSessionCaptures || !localContext || !diffBaselineSessionId) {
      portsRef.current.setNotice("Choose a baseline session before comparing.");
      return;
    }
    if (diffBaselineSessionId === localContext.session.id) {
      portsRef.current.setNotice("Choose a different baseline session.");
      return;
    }
    setSessionDiffPending(true);
    try {
      const [baseline, comparison] = await Promise.all([
        window.radar.getSessionCaptures(diffBaselineSessionId),
        window.radar.getSessionCaptures(localContext.session.id)
      ]);
      const scopedBaseline = baseline.filter((capture) => isAllowedTarget(capture.url, targets));
      const scopedComparison = comparison.filter((capture) => isAllowedTarget(capture.url, targets));
      setSessionDiff(diffSessionCaptures(scopedBaseline, scopedComparison));
      portsRef.current.setNotice("Session diff ready");
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Session diff failed");
    } finally {
      setSessionDiffPending(false);
    }
  }, [diffBaselineSessionId, localContext, targets]);

  return {
    sitemap,
    selectedSitemapNodeId,
    setSelectedSitemapNodeId,
    selectedSitemapNode,
    selectedSitemapInventory,
    applySitemapNode,
    diffBaselineSessionId,
    setDiffBaselineSessionId,
    sessionDiff,
    setSessionDiff,
    sessionDiffPending,
    runSessionDiff
  };
}
