import { Map } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { EndpointInventory } from "../../../shared/endpointInventory.js";
import type { SessionDiffResult } from "../../../shared/sessionDiff.js";
import type { SitemapNode, SitemapTree } from "../../../shared/sitemap.js";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import type { LocalContext, LocalSessionSummary } from "../../types";
import { EmptyState, FieldLabel, ToneText } from "../radar/primitives";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export type SitemapViewProps = Pick<TrafficDomain, "setTrafficSearch"> &
  Pick<WorkbenchShellDomain, "setActiveView"> & {
    sitemap: SitemapTree;
    setSelectedSitemapNodeId: Dispatch<SetStateAction<string>>;
    applySitemapNode: (node: SitemapNode) => void;
    diffBaselineSessionId: string;
    setDiffBaselineSessionId: Dispatch<SetStateAction<string>>;
    sessions: LocalSessionSummary[];
    localContext: LocalContext | null;
    sessionDiffPending: boolean;
    runSessionDiff: () => Promise<void>;
    sessionDiff: SessionDiffResult | null;
    selectedSitemapNode: SitemapNode | null;
    selectedSitemapInventory: EndpointInventory | null;
    trafficQueryExamples: string[];
  };

export function SitemapView({
  sitemap,
  setSelectedSitemapNodeId,
  applySitemapNode,
  diffBaselineSessionId,
  setDiffBaselineSessionId,
  sessions,
  localContext,
  sessionDiffPending,
  runSessionDiff,
  sessionDiff,
  selectedSitemapNode,
  selectedSitemapInventory,
  trafficQueryExamples,
  setTrafficSearch,
  setActiveView
}: SitemapViewProps) {
  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(280px,0.55fr)_minmax(360px,1fr)] max-[1180px]:grid-cols-1">
      <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
        {sitemap.roots.length === 0 && (
          <EmptyState>
            <Map size={18} strokeWidth={1.4} />
            <span>No scoped endpoints mapped yet</span>
          </EmptyState>
        )}
        {sitemap.roots.map((hostId) => {
          const hostNode = sitemap.nodes[hostId];
          if (!hostNode) {
            return null;
          }
          return (
            <div key={hostId} className="border-b border-rule">
              <Button
                variant="ghost"
                className="h-auto w-full justify-start rounded-none px-4 py-3 text-left"
                onClick={() => setSelectedSitemapNodeId(hostId)}
                data-testid={`sitemapHost-${hostId}`}
              >
                <strong className="font-mono text-meta text-bone">{hostNode.host}</strong>
                <span className="ml-2 font-mono text-label text-muted">{hostNode.requestCount} reqs</span>
              </Button>
              {hostNode.childIds.map((pathId) => {
                const pathNode = sitemap.nodes[pathId];
                if (!pathNode) {
                  return null;
                }
                return (
                  <div key={pathId} className="border-t border-rule/70">
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-none py-2 pl-8 pr-4 text-left"
                      onClick={() => setSelectedSitemapNodeId(pathId)}
                      data-testid={`sitemapPath-${pathId}`}
                    >
                      <span className="font-mono text-label text-copy">{pathNode.path}</span>
                    </Button>
                    {pathNode.childIds.map((endpointId) => {
                      const endpointNode = sitemap.nodes[endpointId];
                      if (!endpointNode) {
                        return null;
                      }
                      return (
                        <Button
                          key={endpointId}
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-none py-2 pl-12 pr-4 text-left"
                          onClick={() => applySitemapNode(endpointNode)}
                          data-testid={`sitemapEndpoint-${endpointId}`}
                        >
                          <span className="font-mono text-label text-signal">{endpointNode.methods.join(", ")}</span>
                          <span className="ml-2 font-mono text-label text-muted">{endpointNode.statusFamilies.join(", ")}</span>
                        </Button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="grid min-h-0 gap-4 overflow-auto p-4 [grid-template-rows:auto_auto_minmax(0,1fr)]">
        <div className="grid gap-2 border border-rule p-3">
          <FieldLabel>Session diff</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Select
              variant="compact"
              value={diffBaselineSessionId}
              onChange={(event) => setDiffBaselineSessionId(event.target.value)}
              data-testid="diffBaselineSession"
            >
              <option value="">Baseline session</option>
              {sessions
                .filter((session) => session.id !== localContext?.session.id)
                .map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
            </Select>
            <Button
              variant="outline"
              size="compact"
              disabled={!diffBaselineSessionId || sessionDiffPending}
              onClick={() => void runSessionDiff()}
              data-testid="runSessionDiff"
            >
              Compare
            </Button>
          </div>
          {sessionDiff && (
            <div className="max-h-40 overflow-auto font-mono text-label text-muted">
              {sessionDiff.entries.slice(0, 40).map((entry, index) => (
                <div key={`${entry.host}-${entry.path}-${entry.method}-${index}`} className="border-b border-rule/60 py-1">
                  <ToneText tone={entry.kind === "added" ? "good" : "danger"}>
                    {entry.kind}
                  </ToneText>{" "}
                  {entry.method} {entry.host}{entry.path} — {entry.detail}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedSitemapNode && selectedSitemapInventory && (
          <div className="grid gap-3 border border-rule p-4 font-mono text-label text-muted">
            <strong className="text-bone">
              {selectedSitemapNode.host}
              {selectedSitemapNode.path}
            </strong>
            <span>Methods: {selectedSitemapNode.methods.join(", ") || "—"}</span>
            <span>Status families: {selectedSitemapNode.statusFamilies.join(", ") || "—"}</span>
            <span>Query params: {selectedSitemapInventory.queryParams.join(", ") || "—"}</span>
            <span>Body keys: {selectedSitemapInventory.bodyKeys.join(", ") || "—"}</span>
            <span>Auth signals: {selectedSitemapInventory.authSignals.join(", ") || "—"}</span>
            <Button
              variant="outline"
              size="compact"
              onClick={() => applySitemapNode(selectedSitemapNode!)}
              data-testid="openSitemapInTraffic"
            >
              Open in traffic
            </Button>
          </div>
        )}
        <div className="border border-rule p-3 font-mono text-label text-muted">
          <FieldLabel>Query examples</FieldLabel>
          {trafficQueryExamples.map((example) => (
            <button
              key={example}
              type="button"
              className="mt-2 block w-full text-left text-copy hover:text-signal"
              onClick={() => {
                setTrafficSearch(example);
                setActiveView("traffic");
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
