import type { FormEvent } from "react";
import { Search, X } from "lucide-react";
import { globalSearchKindLabel } from "../../lib";
import type { RadarWorkbench } from "../../hooks/useRadarWorkbench";
import type { GlobalSearchResult } from "../../types";
import { EmptyState, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface GlobalSearchOverlayProps {
  workbench: RadarWorkbench;
  onOpenResult: (result: GlobalSearchResult) => void;
}

export function GlobalSearchOverlay({
  workbench,
  onOpenResult
}: GlobalSearchOverlayProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void workbench.runGlobalSearch(workbench.globalSearchQuery);
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-start bg-ink/76 px-4 py-[8vh] backdrop-blur-sm"
      data-testid="globalSearchOverlay"
      data-component="globalSearchOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          workbench.setGlobalSearchOpen(false);
        }
      }}
    >
      <section className="mx-auto w-full max-w-3xl border border-signal/45 bg-surface shadow-[0_32px_120px_-72px_var(--color-signal)]">
        <form
          className="flex items-center gap-3 border-b border-rule radar-form-gradient p-3"
          onSubmit={submit}
        >
          <Search className="shrink-0 text-signal" size={17} strokeWidth={1.8} />
          <Input
            autoFocus
            value={workbench.globalSearchQuery}
            onChange={(event) => {
              workbench.setGlobalSearchQuery(event.target.value);
              void workbench.runGlobalSearch(event.target.value);
            }}
            placeholder='Search evidence, findings, replays... try kind:capture host:api status:403 "set-cookie"'
            className="h-10 border-0 bg-transparent px-0 text-lead"
            data-testid="globalSearchInput"
            data-component="globalSearchInput"
          />
          <Button type="submit" variant="solid" size="compact" data-testid="runGlobalSearch">
            Search
          </Button>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={() => workbench.setGlobalSearchOpen(false)}
            aria-label="Close global search"
            data-testid="closeGlobalSearch"
          >
            <X size={15} strokeWidth={1.8} />
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
          <span className="rd-eyebrow text-muted">
            {workbench.globalSearchPending
              ? "Searching local project"
              : workbench.globalSearchResult?.ok
                ? `${workbench.globalSearchResult.total} result${workbench.globalSearchResult.total === 1 ? "" : "s"}`
                : "Global project search"}
          </span>
          <span className="rd-label text-muted">
            Filters: kind, host, path, status, severity, source
          </span>
        </div>
        <div className="max-h-[58vh] overflow-auto p-2">
          {workbench.globalSearchError && (
            <div
              className="border border-rust/45 bg-rust/10 p-3 text-lead text-bone"
              data-testid="globalSearchError"
            >
              {workbench.globalSearchError}
            </div>
          )}
          {!workbench.globalSearchError && !workbench.globalSearchResult?.results.length && (
            <EmptyState>
              {workbench.globalSearchQuery.trim()
                ? "No local project results matched that query."
                : "Type to search captures, frames, replays, findings, workflows, plugins, Advanced signals, and filters."}
            </EmptyState>
          )}
          {!workbench.globalSearchError &&
            workbench.globalSearchResult?.results.map((result: GlobalSearchResult) => (
              <button
                key={result.id}
                type="button"
                className="mb-2 block w-full border border-rule bg-ink/28 p-3 text-left transition hover:border-signal/45 hover:bg-signal/[0.06]"
                onClick={() => onOpenResult(result)}
                data-testid={`globalSearchResult-${result.kind}`}
                data-component="globalSearchResult"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="mb-1 block rd-eyebrow text-signal">
                      {globalSearchKindLabel(result.kind)}
                      {result.host ? ` // ${result.host}` : ""}
                    </span>
                    <strong className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone [font-stretch:75%]">
                      {result.title}
                    </strong>
                  </div>
                  <StatusBadge>
                    {result.status || result.severity || result.source || "open"}
                  </StatusBadge>
                </div>
                <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
                  {result.subtitle}
                </p>
                <p className="mt-2 line-clamp-2 text-body leading-relaxed text-copy">
                  {result.detail}
                </p>
                {result.matches[0] && (
                  <p className="mt-2 border-l border-signal/40 pl-2 font-mono text-label leading-relaxed text-muted">
                    {result.matches[0].label}: {result.matches[0].snippet}
                  </p>
                )}
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}
