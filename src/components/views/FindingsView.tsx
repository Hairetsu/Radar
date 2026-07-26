import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Braces,
  Copy,
  ExternalLink,
  FileText,
  GitCompare,
  Search,
  Trash2,
  Zap
} from "lucide-react";
import type { AutomateDomain } from "../../hooks/workbench/useAutomateDomain";
import type { FindingsDomain } from "../../hooks/workbench/useFindingsDomain";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import {
  cn,
  findingConfidences,
  findingEvidenceText,
  findingReportPresets,
  findingSeverities,
  findingSeverityTone,
  findingStatuses,
  findingStatusTone
} from "../../lib";
import type { WebSocketEvent } from "../../types";
import type {
  Finding,
  FindingConfidence,
  FindingReportPreset,
  FindingSeverity,
  FindingStatus,
  FindingTemplateId
} from "../../types";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

export type FindingsViewActionsProps = Pick<
  FindingsDomain & TrafficDomain,
  "findingTemplates" | "selected" | "createFindingFromCapture"
> & {
  findingTemplateId: FindingTemplateId;
  setFindingTemplateId: (value: FindingTemplateId) => void;
  onBuildReport: () => void;
};

export function FindingsViewActions({
  findingTemplates,
  selected,
  createFindingFromCapture,
  findingTemplateId,
  setFindingTemplateId,
  onBuildReport
}: FindingsViewActionsProps) {
  return (
    <>
      <Select
        variant="compact"
        value={findingTemplateId}
        onChange={(event) => setFindingTemplateId(event.target.value as FindingTemplateId)}
        aria-label="Finding template"
        data-testid="findingTemplateSelectHeader"
      >
        {findingTemplates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.title}
          </option>
        ))}
      </Select>
      <Button
        variant="outline"
        type="button"
        onClick={() => void createFindingFromCapture(selected, findingTemplateId)}
        disabled={!selected}
        data-testid="createFindingFromCaptureHeader"
      >
        <FileText size={14} strokeWidth={1.7} />
        From Capture
      </Button>
      <Button
        variant="solid"
        type="button"
        onClick={onBuildReport}
        data-testid="buildFindingReportHeader"
      >
        <ExternalLink size={14} strokeWidth={1.7} />
        Build Report
      </Button>
    </>
  );
}

export type FindingsViewProps = Pick<
  FindingsDomain,
  | "findings"
  | "selectedFinding"
  | "setSelectedFindingId"
  | "findingMergeSuggestions"
  | "mergeFindingPair"
  | "findingTemplates"
  | "createFindingFromCapture"
  | "createFindingFromWebSocket"
  | "deleteFinding"
  | "attachSelectedCaptureToFinding"
  | "saveFinding"
  | "buildFindingReportPreview"
  | "findingRetestMatrix"
  | "findingReport"
> &
  Pick<TrafficDomain, "selected"> &
  Pick<AutomateDomain, "selectedAutomateResult"> &
  Pick<WorkbenchShellDomain, "setNotice"> & {
  promoteAutomateResultToFinding: () => ReturnType<FindingsDomain["promoteAutomateResultToFinding"]>;
  attachSelectedAutomateResultToFinding: () => ReturnType<
    FindingsDomain["attachSelectedAutomateResultToFinding"]
  >;
  findingTemplateId: FindingTemplateId;
  setFindingTemplateId: (value: FindingTemplateId) => void;
  selectedWebSocketEvent: WebSocketEvent | null;
  buildReportRef?: { current: (() => void) | null };
};

export function FindingsView({
  findings,
  selectedFinding,
  setSelectedFindingId,
  findingMergeSuggestions,
  mergeFindingPair,
  findingTemplates,
  createFindingFromCapture,
  selected,
  createFindingFromWebSocket,
  promoteAutomateResultToFinding,
  selectedAutomateResult,
  deleteFinding,
  attachSelectedCaptureToFinding,
  attachSelectedAutomateResultToFinding,
  saveFinding,
  buildFindingReportPreview,
  findingRetestMatrix,
  findingReport,
  setNotice,
  findingTemplateId,
  setFindingTemplateId,
  selectedWebSocketEvent,
  buildReportRef
}: FindingsViewProps) {
  const [findingDraft, setFindingDraft] = useState<Finding | null>(null);
  const [findingReportFormat, setFindingReportFormat] = useState<"markdown" | "html">("markdown");
  const [findingReportPreset, setFindingReportPreset] = useState<FindingReportPreset>("client-report");
  const [findingReportTitle, setFindingReportTitle] = useState("Radar Client Report");
  const [findingReportIncludeDrafts, setFindingReportIncludeDrafts] = useState(false);
  const [findingReportIncludeRaw, setFindingReportIncludeRaw] = useState(false);
  const [findingReportExecutiveSummary, setFindingReportExecutiveSummary] = useState("");
  const [findingReportMethodology, setFindingReportMethodology] = useState("");
  const [findingReportScopeSummary, setFindingReportScopeSummary] = useState("");
  const [findingReportLimitations, setFindingReportLimitations] = useState("");
  const [findingReportChangeLog, setFindingReportChangeLog] = useState("");
  const [findingStatusFilter, setFindingStatusFilter] = useState<FindingStatus | "all">("all");
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<FindingSeverity | "all">("all");
  const [findingOwnerFilter, setFindingOwnerFilter] = useState("all");
  const [findingComponentFilter, setFindingComponentFilter] = useState("all");
  const [findingTextFilter, setFindingTextFilter] = useState("");
  const findingSelectionIdRef = useRef("");

  useLayoutEffect(() => {
    const selectedFindingId = selectedFinding?.id || "";
    if (findingSelectionIdRef.current === selectedFindingId) {
      return;
    }
    findingSelectionIdRef.current = selectedFindingId;
    setFindingDraft(selectedFinding);
    setFindingTemplateId(selectedFinding?.templateId || "headers");
  }, [selectedFinding, setFindingTemplateId]);

  const findingOwnerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          findings
            .flatMap((finding) => [finding.owner, finding.assignee])
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [findings]
  );

  const findingComponentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          findings
            .map((finding) => finding.component.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [findings]
  );

  const filteredFindings = useMemo(() => {
    const query = findingTextFilter.trim().toLowerCase();
    return findings.filter((finding) => {
      if (findingStatusFilter !== "all" && finding.status !== findingStatusFilter) {
        return false;
      }
      if (findingSeverityFilter !== "all" && finding.severity !== findingSeverityFilter) {
        return false;
      }
      if (
        findingOwnerFilter !== "all" &&
        finding.owner.trim() !== findingOwnerFilter &&
        finding.assignee.trim() !== findingOwnerFilter
      ) {
        return false;
      }
      if (findingComponentFilter !== "all" && finding.component.trim() !== findingComponentFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        finding.title,
        finding.component,
        finding.owner,
        finding.assignee,
        finding.status,
        finding.severity,
        finding.affectedAssets.join(" "),
        finding.notes
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    findingComponentFilter,
    findingOwnerFilter,
    findingSeverityFilter,
    findingStatusFilter,
    findingTextFilter,
    findings
  ]);

  const updateFindingDraft = (patch: Partial<Finding>) => {
    setFindingDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const saveFindingDraft = () => {
    if (!findingDraft) {
      return;
    }
    void saveFinding({
      ...findingDraft,
      title: findingDraft.title.trim(),
      component: findingDraft.component.trim(),
      owner: findingDraft.owner.trim(),
      assignee: findingDraft.assignee.trim(),
      affectedAssets: findingDraft.affectedAssets.map((asset) => asset.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
      reviewedAt:
        findingDraft.status === "reviewed" && !findingDraft.reviewedAt
          ? new Date().toISOString()
          : findingDraft.reviewedAt
    });
  };

  const buildFindingReport = () => {
    void buildFindingReportPreview({
      format: findingReportFormat,
      preset: findingReportPreset,
      title: findingReportTitle.trim() || undefined,
      includeDrafts: findingReportIncludeDrafts,
      includeAppendix: true,
      includeRawEvidence: findingReportIncludeRaw,
      includeRetestMatrix: true,
      executiveSummary: findingReportExecutiveSummary,
      methodology: findingReportMethodology,
      scopeSummary: findingReportScopeSummary,
      limitations: findingReportLimitations,
      changeLog: findingReportChangeLog
    });
  };

  if (buildReportRef) {
    buildReportRef.current = buildFindingReport;
  }

  const copyFindingReport = async () => {
    if (!findingReport?.body) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(findingReport.body);
      setNotice("Report copied");
    } catch {
      setNotice("Report copy failed");
    }
  };

  const downloadFindingReport = () => {
    if (!findingReport?.body) {
      return;
    }
    const extension = findingReport.format === "html" ? "html" : "md";
    const blob = new window.Blob([findingReport.body], {
      type: findingReport.format === "html" ? "text/html" : "text/markdown"
    });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `radar-findings.${extension}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(300px,0.42fr)_minmax(460px,1fr)] max-[1180px]:grid-cols-1">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_auto_minmax(0,1fr)_auto] max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(4,minmax(0,1fr))]">
          {[
            ["Total", findings.length],
            ["Draft", findings.filter((finding) => finding.status === "draft").length],
            ["Reviewed", findings.filter((finding) => finding.status === "reviewed").length],
            ["Retest", findings.filter((finding) => finding.status.startsWith("retest")).length]
          ].map(([label, value]) => (
            <div key={label} className="radar-card-gradient px-4 py-3">
              <span className="block rd-eyebrow text-muted">
                {label}
              </span>
              <strong className="mt-1 block font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="grid gap-2 border-b border-rule bg-ink/35 p-3" data-testid="findingFilters">
          <Input
            value={findingTextFilter}
            onChange={(event) => setFindingTextFilter(event.target.value)}
            placeholder="Filter title, asset, owner, notes"
            aria-label="Filter findings"
            data-testid="findingTextFilter"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              variant="compact"
              value={findingStatusFilter}
              onChange={(event) => setFindingStatusFilter(event.target.value as FindingStatus | "all")}
              data-testid="findingStatusFilter"
            >
              <option value="all">All status</option>
              {findingStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
            <Select
              variant="compact"
              value={findingSeverityFilter}
              onChange={(event) => setFindingSeverityFilter(event.target.value as FindingSeverity | "all")}
              data-testid="findingSeverityFilter"
            >
              <option value="all">All severity</option>
              {findingSeverities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </Select>
            <Select
              variant="compact"
              value={findingOwnerFilter}
              onChange={(event) => setFindingOwnerFilter(event.target.value)}
              data-testid="findingOwnerFilter"
            >
              <option value="all">All owners</option>
              {findingOwnerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </Select>
            <Select
              variant="compact"
              value={findingComponentFilter}
              onChange={(event) => setFindingComponentFilter(event.target.value)}
              data-testid="findingComponentFilter"
            >
              <option value="all">All components</option>
              {findingComponentOptions.map((component) => (
                <option key={component} value={component}>
                  {component}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="min-h-0 overflow-auto radar-traffic-list" data-testid="findingsList">
          {findings.length === 0 && (
            <EmptyState>
              <FileText size={18} strokeWidth={1.4} />
              <span>No findings yet</span>
            </EmptyState>
          )}
          {findings.length > 0 && filteredFindings.length === 0 && (
            <EmptyState>
              <Search size={18} strokeWidth={1.4} />
              <span>No findings match the current filters</span>
            </EmptyState>
          )}
          {filteredFindings.map((finding) => (
            <Button
              key={finding.id}
              variant="ghost"
              className={cn(
                "relative grid h-auto w-full justify-stretch gap-2 rounded-none border-0 border-b border-rule bg-transparent px-4 py-3 text-left normal-case transition hover:bg-signal/[0.06]",
                selectedFinding?.id === finding.id && "bg-signal/[0.09]"
              )}
              onClick={() => setSelectedFindingId(finding.id)}
              data-testid={`findingRow-${finding.id}`}
              data-component="findingRow"
            >
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge tone={findingSeverityTone(finding.severity)}>{finding.severity}</StatusBadge>
                <StatusBadge tone={findingStatusTone(finding.status)}>{finding.status}</StatusBadge>
                <span className="ml-auto rd-label text-muted">
                  {finding.confidence}
                </span>
              </div>
              <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
                {finding.title}
              </strong>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
                {[finding.component, finding.assignee || finding.owner, `${finding.evidence.length} evidence`]
                  .filter(Boolean)
                  .join(" / ")}
              </span>
            </Button>
          ))}
        </div>

        <div className="grid gap-2 border-t border-rule p-3">
          {findingMergeSuggestions.length > 0 && (
            <div className="grid gap-2 border border-signal/25 bg-signal/[0.04] p-3" data-testid="findingMergeQueue">
              <div className="flex items-center justify-between gap-2">
                <span className="rd-eyebrow text-signal">
                  Merge Queue
                </span>
                <StatusBadge tone="move">{findingMergeSuggestions.length}</StatusBadge>
              </div>
              {findingMergeSuggestions.slice(0, 3).map((suggestion) => {
                const primary = findings.find((finding) => finding.id === suggestion.primaryId);
                const duplicate = findings.find((finding) => finding.id === suggestion.duplicateId);
                return (
                  <div key={suggestion.id} className="grid gap-2 border border-rule bg-ink/35 p-2">
                    <div className="min-w-0 font-mono text-label text-muted">
                      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-copy">
                        {primary?.title || suggestion.primaryId}
                      </span>
                      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        duplicate: {duplicate?.title || suggestion.duplicateId}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void mergeFindingPair(suggestion.primaryId, suggestion.duplicateId)}
                      data-testid={`mergeFinding-${suggestion.primaryId}-${suggestion.duplicateId}`}
                    >
                      <GitCompare size={13} strokeWidth={1.7} />
                      Merge
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <FieldLabel htmlFor="findingTemplateSelect">Template</FieldLabel>
          <Select
            id="findingTemplateSelect"
            value={findingTemplateId}
            onChange={(event) => setFindingTemplateId(event.target.value as FindingTemplateId)}
            data-testid="findingTemplateSelect"
          >
            {findingTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => void createFindingFromCapture(selected, findingTemplateId)}
              disabled={!selected}
              data-testid="createFindingFromCapture"
            >
              <Activity size={13} strokeWidth={1.7} />
              Capture
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => void createFindingFromWebSocket(selectedWebSocketEvent, findingTemplateId)}
              disabled={!selectedWebSocketEvent}
              data-testid="createFindingFromWebSocket"
            >
              <Braces size={13} strokeWidth={1.7} />
              Frame
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => void promoteAutomateResultToFinding()}
              disabled={!selectedAutomateResult}
              data-testid="createFindingFromAutomate"
            >
              <Zap size={13} strokeWidth={1.7} />
              Automate
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => void deleteFinding()}
              disabled={!selectedFinding}
              data-testid="deleteFinding"
            >
              <Trash2 size={13} strokeWidth={1.7} />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 [grid-template-rows:minmax(0,1fr)_minmax(260px,0.48fr)]">
        <div className="min-h-0 overflow-auto px-5 py-5">
          {!findingDraft && (
            <EmptyState>
              <FileText size={18} strokeWidth={1.4} />
              <span>Create or select a finding to review.</span>
            </EmptyState>
          )}
          {findingDraft && (
            <div className="grid gap-4" data-testid="findingEditor" data-component="findingEditor">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_160px_180px]">
                <div>
                  <FieldLabel htmlFor="findingTitle">Title</FieldLabel>
                  <Input
                    id="findingTitle"
                    value={findingDraft.title}
                    onChange={(event) => updateFindingDraft({ title: event.target.value })}
                    data-testid="findingTitle"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="findingSeverity">Severity</FieldLabel>
                  <Select
                    id="findingSeverity"
                    value={findingDraft.severity}
                    onChange={(event) => updateFindingDraft({ severity: event.target.value as FindingSeverity })}
                    data-testid="findingSeverity"
                  >
                    {findingSeverities.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="findingConfidence">Confidence</FieldLabel>
                  <Select
                    id="findingConfidence"
                    value={findingDraft.confidence}
                    onChange={(event) =>
                      updateFindingDraft({ confidence: event.target.value as FindingConfidence })
                    }
                    data-testid="findingConfidence"
                  >
                    {findingConfidences.map((confidence) => (
                      <option key={confidence} value={confidence}>
                        {confidence}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="findingStatus">Status</FieldLabel>
                  <Select
                    id="findingStatus"
                    value={findingDraft.status}
                    onChange={(event) => updateFindingDraft({ status: event.target.value as FindingStatus })}
                    data-testid="findingStatus"
                  >
                    {findingStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <FieldLabel htmlFor="findingAssets">Affected Assets</FieldLabel>
                  <Textarea
                    id="findingAssets"
                    variant="code"
                    className="h-[82px]"
                    value={findingDraft.affectedAssets.join("\n")}
                    onChange={(event) =>
                      updateFindingDraft({
                        affectedAssets: event.target.value
                          .split("\n")
                          .map((asset) => asset.trim())
                          .filter(Boolean)
                      })
                    }
                    data-testid="findingAssets"
                  />
                </div>
                <div className="grid content-start gap-3">
                  <div>
                    <FieldLabel htmlFor="findingComponent">Component</FieldLabel>
                    <Input
                      id="findingComponent"
                      value={findingDraft.component}
                      onChange={(event) => updateFindingDraft({ component: event.target.value })}
                      data-testid="findingComponent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="findingOwner">Owner</FieldLabel>
                      <Input
                        id="findingOwner"
                        value={findingDraft.owner}
                        onChange={(event) => updateFindingDraft({ owner: event.target.value })}
                        data-testid="findingOwner"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="findingAssignee">Assignee</FieldLabel>
                      <Input
                        id="findingAssignee"
                        value={findingDraft.assignee}
                        onChange={(event) => updateFindingDraft({ assignee: event.target.value })}
                        data-testid="findingAssignee"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={findingDraft.source === "ai" ? "move" : findingDraft.source === "automate" ? "warn" : "ghost"}>
                      {findingDraft.source}
                    </StatusBadge>
                    <StatusBadge>{findingDraft.evidence.length} evidence</StatusBadge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="findingReproduction">Reproduction</FieldLabel>
                  <Textarea
                    id="findingReproduction"
                    variant="code"
                    className="h-[180px]"
                    value={findingDraft.reproductionSteps}
                    onChange={(event) => updateFindingDraft({ reproductionSteps: event.target.value })}
                    data-testid="findingReproduction"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="findingImpact">Impact</FieldLabel>
                  <Textarea
                    id="findingImpact"
                    className="h-[180px]"
                    value={findingDraft.impact}
                    onChange={(event) => updateFindingDraft({ impact: event.target.value })}
                    data-testid="findingImpact"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="findingRemediation">Remediation</FieldLabel>
                  <Textarea
                    id="findingRemediation"
                    className="h-[180px]"
                    value={findingDraft.remediation}
                    onChange={(event) => updateFindingDraft({ remediation: event.target.value })}
                    data-testid="findingRemediation"
                  />
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <FieldLabel htmlFor="findingNotes">Notes</FieldLabel>
                  <Textarea
                    id="findingNotes"
                    className="h-[132px]"
                    value={findingDraft.notes}
                    onChange={(event) => updateFindingDraft({ notes: event.target.value })}
                    data-testid="findingNotes"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="findingRetest">Retest Result</FieldLabel>
                  <Textarea
                    id="findingRetest"
                    className="h-[132px]"
                    value={findingDraft.retestResult}
                    onChange={(event) => updateFindingDraft({ retestResult: event.target.value })}
                    data-testid="findingRetest"
                  />
                </div>
              </div>

              <div className="grid gap-3 border border-rule bg-ink/25 p-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                <pre className="max-h-[150px] overflow-auto text-meta" data-testid="findingEvidence">
                  {findingEvidenceText(findingDraft)}
                </pre>
                <div className="flex flex-wrap content-start gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void attachSelectedCaptureToFinding(selected)}
                    disabled={!selected}
                    data-testid="attachCaptureEvidence"
                  >
                    <Activity size={13} strokeWidth={1.7} />
                    Attach Capture
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void attachSelectedAutomateResultToFinding()}
                    disabled={!selectedAutomateResult}
                    data-testid="attachAutomateEvidence"
                  >
                    <Zap size={13} strokeWidth={1.7} />
                    Attach Automate
                  </Button>
                  <Button
                    variant="solid"
                    type="button"
                    onClick={saveFindingDraft}
                    data-testid="saveFinding"
                  >
                    <FileText size={13} strokeWidth={1.7} />
                    Save Finding
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid min-h-0 border-t border-rule bg-ink/25 [grid-template-columns:minmax(320px,0.44fr)_minmax(0,1fr)] max-[900px]:grid-cols-1">
          <div className="grid min-h-0 content-start gap-3 overflow-auto border-r border-rule p-4 max-[900px]:border-r-0 max-[900px]:border-b">
            <div className="grid grid-cols-2 gap-2">
              <Select
                variant="compact"
                value={findingReportPreset}
                onChange={(event) => setFindingReportPreset(event.target.value as FindingReportPreset)}
                data-testid="findingReportPreset"
              >
                {findingReportPresets.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </Select>
              <Select
                variant="compact"
                value={findingReportFormat}
                onChange={(event) => setFindingReportFormat(event.target.value as "markdown" | "html")}
                data-testid="findingReportFormat"
              >
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </Select>
            </div>
            <Input
              value={findingReportTitle}
              onChange={(event) => setFindingReportTitle(event.target.value)}
              aria-label="Report title"
              data-testid="findingReportTitle"
            />
            <div className="grid gap-2 xl:grid-cols-2">
              <Textarea
                value={findingReportExecutiveSummary}
                onChange={(event) => setFindingReportExecutiveSummary(event.target.value)}
                placeholder="Executive summary"
                className="h-[78px]"
                data-testid="findingReportExecutiveSummary"
              />
              <Textarea
                value={findingReportScopeSummary}
                onChange={(event) => setFindingReportScopeSummary(event.target.value)}
                placeholder="Scope summary"
                className="h-[78px]"
                data-testid="findingReportScopeSummary"
              />
              <Textarea
                value={findingReportMethodology}
                onChange={(event) => setFindingReportMethodology(event.target.value)}
                placeholder="Methodology"
                className="h-[78px]"
                data-testid="findingReportMethodology"
              />
              <Textarea
                value={findingReportLimitations}
                onChange={(event) => setFindingReportLimitations(event.target.value)}
                placeholder="Limitations"
                className="h-[78px]"
                data-testid="findingReportLimitations"
              />
            </div>
            <Textarea
              value={findingReportChangeLog}
              onChange={(event) => setFindingReportChangeLog(event.target.value)}
              placeholder="Change log"
              className="h-[70px]"
              data-testid="findingReportChangeLog"
            />
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="move">{findingRetestMatrix.length} retest rows</StatusBadge>
              <StatusBadge tone={(findingReport?.validationWarnings?.length || 0) > 0 ? "warn" : "good"}>
                {findingReport?.validationWarnings?.length || 0} warnings
              </StatusBadge>
            </div>
            <label className="flex items-center gap-2 rd-label text-muted">
              <input
                type="checkbox"
                checked={findingReportIncludeDrafts}
                onChange={(event) => setFindingReportIncludeDrafts(event.target.checked)}
              />
              Include drafts
            </label>
            <label className="flex items-center gap-2 rd-label text-muted">
              <input
                type="checkbox"
                checked={findingReportIncludeRaw}
                onChange={(event) => setFindingReportIncludeRaw(event.target.checked)}
              />
              Raw evidence
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="solid"
                type="button"
                onClick={buildFindingReport}
                data-testid="buildFindingReport"
              >
                <ExternalLink size={13} strokeWidth={1.7} />
                Build
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => void copyFindingReport()}
                disabled={!findingReport}
                data-testid="copyFindingReport"
              >
                <Copy size={13} strokeWidth={1.7} />
                Copy
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={downloadFindingReport}
                disabled={!findingReport}
                data-testid="downloadFindingReport"
              >
                <ExternalLink size={13} strokeWidth={1.7} />
                Download
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            {(findingReport?.validationWarnings?.length || 0) > 0 && (
              <div className="border-b border-rule bg-rust/5 p-3 font-mono text-label text-rust" data-testid="findingReportWarnings">
                {findingReport?.validationWarnings?.slice(0, 5).map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            )}
            <pre className="min-h-0 flex-1 overflow-auto p-4 text-meta" data-testid="findingReportPreview">
              {findingReport?.body || "Build a report preview from reviewed findings. Drafts and raw evidence are opt-in."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
