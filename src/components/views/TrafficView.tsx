import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Copy,
  Eraser,
  FileText,
  Repeat2,
  Search,
  Square
} from "lucide-react";
import type { FindingsDomain } from "../../hooks/workbench/useFindingsDomain";
import { TRAFFIC_SORT_FIELDS, type TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import {
  bodyPreview,
  cn,
  elapsed,
  evidenceMetadataText,
  formatHeaders,
  statusTone,
  tlsLine
} from "../../lib";
import type { CapturedRequest, EvidenceAnnotation, FindingTemplateId, SavedFilter } from "../../types";
import { EmptyState, StatusBadge, StatusPill } from "../radar/primitives";
import {
  detailActionClass,
  detailTabClass,
  detailTabScrollClass,
  detailTabSplitRowClass,
  ellipsisMono,
  trafficRowClass
} from "../shell/layoutClasses";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

export type TrafficViewProps = Pick<
  TrafficDomain,
  | "trafficMethodFilter"
  | "setTrafficMethodFilter"
  | "trafficMethods"
  | "trafficTypeFilter"
  | "setTrafficTypeFilter"
  | "trafficTypes"
  | "trafficSortField"
  | "setTrafficSortField"
  | "trafficSortDirection"
  | "setTrafficSortDirection"
  | "trafficSearchRef"
  | "trafficSearch"
  | "setTrafficSearch"
  | "trafficQueryError"
  | "trafficCaptures"
  | "scopedTrafficCaptures"
  | "selectedIds"
  | "bulkTagCaptures"
  | "bulkExportCaptures"
  | "bulkDeleteCaptures"
  | "selectTrafficCapture"
  | "selected"
> & {
  savedFilters: SavedFilter[];
  applySavedFilter: (filter: SavedFilter) => void;
  saveSavedFilter: (name: string, query: string, surface?: SavedFilter["surface"]) => Promise<void>;
  activeDetail: "request" | "response";
  setActiveDetail: Dispatch<SetStateAction<"request" | "response">>;
  cloneToRepeater: (capture: CapturedRequest | null) => void;
  createFindingFromCapture: FindingsDomain["createFindingFromCapture"];
  saveEvidenceAnnotation: (annotation: EvidenceAnnotation) => Promise<void>;
  getEvidenceAnnotation: (evidenceId: string, kind: EvidenceAnnotation["kind"]) => EvidenceAnnotation;
  setNotice: WorkbenchShellDomain["setNotice"];
  findingTemplateId: FindingTemplateId;
  onOpenRequestMenu: (event: MouseEvent<HTMLElement>, capture?: CapturedRequest | null) => void;
};

export function TrafficView({
  trafficMethodFilter,
  setTrafficMethodFilter,
  trafficMethods,
  trafficTypeFilter,
  setTrafficTypeFilter,
  trafficTypes,
  trafficSortField,
  setTrafficSortField,
  trafficSortDirection,
  setTrafficSortDirection,
  trafficSearchRef,
  trafficSearch,
  setTrafficSearch,
  trafficQueryError,
  trafficCaptures,
  scopedTrafficCaptures,
  savedFilters,
  applySavedFilter,
  saveSavedFilter,
  selectedIds,
  bulkTagCaptures,
  bulkExportCaptures,
  bulkDeleteCaptures,
  selectTrafficCapture,
  selected,
  activeDetail,
  setActiveDetail,
  cloneToRepeater,
  createFindingFromCapture,
  saveEvidenceAnnotation,
  getEvidenceAnnotation,
  setNotice,
  findingTemplateId,
  onOpenRequestMenu
}: TrafficViewProps) {
  const [savedFilterName, setSavedFilterName] = useState("");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [annotationTags, setAnnotationTags] = useState("");
  const [annotationComment, setAnnotationComment] = useState("");

  const trafficFiltersActive = Boolean(
    trafficSearch.trim() || trafficMethodFilter !== "all" || trafficTypeFilter !== "all"
  );

  const selectedDetailText = selected
    ? activeDetail === "request"
      ? `${selected.method} ${selected.url}\n${tlsLine(selected)}${evidenceMetadataText(selected)}\n\n${formatHeaders(
          selected.requestHeaders
        )}\n\n${bodyPreview(selected.requestBody)}`
      : `${selected.status || ""} ${selected.statusText}\n${tlsLine(selected)}${evidenceMetadataText(
          selected
        )}\n\n${formatHeaders(selected.responseHeaders)}\n\n${bodyPreview(selected.responseBody)}`
    : "";

  const copySelectedDetail = async () => {
    if (!selectedDetailText) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(selectedDetailText);
      setNotice(`${activeDetail === "request" ? "Request" : "Response"} copied`);
    } catch {
      setNotice("Copy failed");
    }
  };

  const selectedCaptureId = selected?.id || "";

  useEffect(() => {
    if (!selectedCaptureId) {
      setAnnotationTags("");
      setAnnotationComment("");
      return;
    }
    const annotation = getEvidenceAnnotation(selectedCaptureId, "capture");
    setAnnotationTags(annotation.tags.join(", "));
    setAnnotationComment(annotation.comment);
  }, [selectedCaptureId, getEvidenceAnnotation]);

  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(0,1.15fr)_minmax(340px,0.85fr)] max-[1180px]:grid-cols-1 max-[1180px]:auto-rows-[minmax(520px,auto)]">
      <div className="flex min-h-0 flex-col border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="radar-traffic-filter grid shrink-0 items-center gap-2 border-b border-rule radar-form-gradient px-3 py-2.5">
          <Select
            variant="compact"
            value={trafficMethodFilter}
            onChange={(event) => setTrafficMethodFilter(event.target.value)}
            aria-label="Method filter"
            data-testid="trafficMethodFilter"
            data-component="trafficMethodFilter"
          >
            <option value="all">All methods</option>
            {trafficMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
          <Select
            variant="compact"
            value={trafficTypeFilter}
            onChange={(event) => setTrafficTypeFilter(event.target.value)}
            aria-label="Resource type filter"
            data-testid="trafficTypeFilter"
            data-component="trafficTypeFilter"
          >
            <option value="all">All types</option>
            {trafficTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Select
            variant="compact"
            value={trafficSortField}
            onChange={(event) => setTrafficSortField(event.target.value as typeof trafficSortField)}
            aria-label="Sort traffic by"
            data-testid="trafficSortField"
            data-component="trafficSortField"
          >
            {TRAFFIC_SORT_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </Select>
          <Button
            variant="icon"
            size="icon"
            onClick={() => setTrafficSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
            title={trafficSortDirection === "asc" ? "Sort ascending" : "Sort descending"}
            aria-label={trafficSortDirection === "asc" ? "Sort ascending" : "Sort descending"}
            data-testid="trafficSortDirection"
            data-component="trafficSortDirection"
          >
            {trafficSortDirection === "asc" ? (
              <ArrowUpWideNarrow size={15} strokeWidth={1.7} />
            ) : (
              <ArrowDownWideNarrow size={15} strokeWidth={1.7} />
            )}
          </Button>
          <div className="traffic-search relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal"
              size={13}
              strokeWidth={1.8}
            />
            <Input
              ref={trafficSearchRef}
              variant="compact"
              className="w-full pl-8"
              value={trafficSearch}
              onChange={(event) => setTrafficSearch(event.target.value)}
              placeholder="Query: method:POST path:/api status:401,403"
              spellCheck={false}
              aria-label="Traffic query"
              data-testid="trafficSearch"
              data-component="trafficSearch"
            />
          </div>
          {trafficQueryError && (
            <span className="font-mono text-label text-bad" data-testid="trafficQueryError">
              {trafficQueryError}
            </span>
          )}
          <span className="flex h-9 items-center whitespace-nowrap rd-eyebrow text-muted">
            {trafficCaptures.length}/{scopedTrafficCaptures.length}
          </span>
          <Button
            variant="icon"
            size="icon"
            disabled={!trafficFiltersActive}
            onClick={() => {
              setTrafficMethodFilter("all");
              setTrafficTypeFilter("all");
              setTrafficSearch("");
            }}
            title="Clear filters"
            data-testid="clearTrafficFilters"
            data-component="clearTrafficFilters"
          >
            <Eraser size={15} strokeWidth={1.7} />
          </Button>
        </div>
        {(trafficSearch.trim() || savedFilters.length > 0) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
            {trafficSearch.trim() && (
              <StatusPill live>
                {trafficSearch.trim()}
                <button
                  type="button"
                  className="ml-2 text-muted hover:text-bone"
                  onClick={() => setTrafficSearch("")}
                  aria-label="Remove query chip"
                >
                  ×
                </button>
              </StatusPill>
            )}
            {savedFilters
              .filter((filter) => filter.surface !== "websocket")
              .slice(0, 6)
              .map((filter) => (
                <Button
                  key={filter.id}
                  variant="outline"
                  size="compact"
                  onClick={() => applySavedFilter(filter)}
                  data-testid={`savedFilter-${filter.id}`}
                >
                  {filter.name}
                </Button>
              ))}
            {trafficSearch.trim() && (
              <>
                <Input
                  variant="compact"
                  className="w-[140px]"
                  value={savedFilterName}
                  onChange={(event) => setSavedFilterName(event.target.value)}
                  placeholder="Filter name"
                  data-testid="savedFilterName"
                />
                <Button
                  variant="outline"
                  size="compact"
                  disabled={!savedFilterName.trim()}
                  onClick={() => {
                    void saveSavedFilter(savedFilterName, trafficSearch, "traffic");
                    setSavedFilterName("");
                  }}
                  data-testid="saveTrafficFilter"
                >
                  Save
                </Button>
              </>
            )}
          </div>
        )}
        {selectedIds.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rule bg-rust/5 px-3 py-2">
            <span className="rd-label text-muted">
              {selectedIds.length} selected
            </span>
            <Input
              variant="compact"
              className="w-[120px]"
              value={bulkTagValue}
              onChange={(event) => setBulkTagValue(event.target.value)}
              placeholder="tag"
              data-testid="bulkTagInput"
            />
            <Button
              variant="outline"
              size="compact"
              disabled={!bulkTagValue.trim()}
              onClick={() => {
                void bulkTagCaptures(selectedIds, bulkTagValue);
                setBulkTagValue("");
              }}
              data-testid="bulkTagCaptures"
            >
              Tag
            </Button>
            <Button
              variant="outline"
              size="compact"
              onClick={() => void bulkExportCaptures(selectedIds)}
              data-testid="bulkExportCaptures"
            >
              Export
            </Button>
            <Button
              variant="outline"
              size="compact"
              onClick={() => {
                if (window.confirm(`Delete ${selectedIds.length} captures?`)) {
                  void bulkDeleteCaptures(selectedIds);
                }
              }}
              data-testid="bulkDeleteCaptures"
            >
              Delete
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto radar-traffic-list">
          {trafficCaptures.length === 0 && (
            <EmptyState>
              <Activity size={18} strokeWidth={1.4} />
              <span>
                {scopedTrafficCaptures.length === 0
                  ? "No in-scope HTTP/S requests intercepted"
                  : "No captures match filters"}
              </span>
            </EmptyState>
          )}
          {trafficCaptures.map((capture) => {
            const rowSelected = selectedIds.includes(capture.id);
            const focused = capture.id === selected?.id;
            return (
              <Button
                key={capture.id}
                variant="ghost"
                className={trafficRowClass(rowSelected, focused)}
                data-selected={rowSelected ? "true" : "false"}
                onClick={(event) => selectTrafficCapture(capture.id, event)}
                onContextMenu={(event) => onOpenRequestMenu(event, capture)}
                data-testid={`trafficRow-${capture.id}`}
                data-component="trafficRow"
              >
                <span className="font-mono text-meta font-bold uppercase tracking-data text-signal">
                  {capture.method}
                </span>
                <StatusBadge tone={statusTone(capture.status)}>{capture.status || "···"}</StatusBadge>
                <span className={cn(ellipsisMono, "font-medium text-bone")}>{capture.host}</span>
                <span className={ellipsisMono}>{capture.path}</span>
                <span className={cn(ellipsisMono, "traffic-type")}>{capture.type || capture.source}</span>
                <span className={ellipsisMono}>{elapsed(capture.durationMs)}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col radar-detail-pane">
        <div className={detailTabSplitRowClass}>
          <div className={detailTabScrollClass}>
            <Button
              variant="ghost"
              className={detailTabClass(activeDetail === "request")}
              onClick={() => setActiveDetail("request")}
              data-testid="detailTabRequest"
              data-component="detailTabRequest"
            >
              <Square size={9} strokeWidth={2} />
              Request
            </Button>
            <Button
              variant="ghost"
              className={detailTabClass(activeDetail === "response")}
              onClick={() => setActiveDetail("response")}
              data-testid="detailTabResponse"
              data-component="detailTabResponse"
            >
              <Square size={9} strokeWidth={2} />
              Response
            </Button>
          </div>
          <div className="flex shrink-0 items-stretch">
            <Button
              variant="ghost"
              className={detailActionClass}
              onClick={() => cloneToRepeater(selected)}
              title="Clone to repeater"
              aria-label="Clone to repeater"
              data-testid="cloneToRepeater"
              data-component="cloneToRepeater"
            >
              <Repeat2 size={14} strokeWidth={1.7} />
            </Button>
            <Button
              variant="ghost"
              className={detailActionClass}
              onClick={() => void copySelectedDetail()}
              disabled={!selectedDetailText}
              title="Copy active detail"
              aria-label="Copy active detail"
              data-testid="copyTrafficDetail"
              data-component="copyTrafficDetail"
            >
              <Copy size={14} strokeWidth={1.7} />
            </Button>
            <Button
              variant="ghost"
              className={detailActionClass}
              onClick={() => void createFindingFromCapture(selected, findingTemplateId)}
              disabled={!selected}
              title="Create draft finding from selected capture"
              aria-label="Create draft finding from selected capture"
              data-testid="findingFromTraffic"
              data-component="findingFromTraffic"
            >
              <FileText size={14} strokeWidth={1.7} />
            </Button>
          </div>
        </div>
        {selected && (
          <div className="grid gap-2 border-b border-rule px-4 py-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)_auto] max-[900px]:grid-cols-1">
            <Input
              variant="compact"
              value={annotationTags}
              onChange={(event) => setAnnotationTags(event.target.value)}
              placeholder="tags: review, auth"
              data-testid="captureTags"
            />
            <Input
              variant="compact"
              value={annotationComment}
              onChange={(event) => setAnnotationComment(event.target.value)}
              placeholder="comment"
              data-testid="captureComment"
            />
            <Button
              variant="outline"
              size="compact"
              onClick={() => {
                void saveEvidenceAnnotation({
                  evidenceId: selected.id,
                  kind: "capture",
                  tags: annotationTags
                    .split(",")
                    .map((tag) => tag.trim().toLowerCase())
                    .filter(Boolean),
                  comment: annotationComment,
                  updatedAt: new Date().toISOString()
                });
              }}
              data-testid="saveCaptureAnnotation"
            >
              Save note
            </Button>
          </div>
        )}
        <pre
          className="min-h-0 flex-1 select-text cursor-text radar-pre-gradient px-5 py-4"
          onContextMenu={(event) => onOpenRequestMenu(event)}
          data-testid="trafficDetailText"
        >
          {selectedDetailText}
        </pre>
      </div>
    </div>
  );
}
