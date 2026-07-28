import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  Finding,
  FindingReport,
  FindingReportOptions,
  FindingReportPreset,
  FindingSeverity,
  FindingStatus,
  FindingTemplateId
} from "../types";

export function useFindingsViewState({
  findings,
  selectedFinding,
  setFindingTemplateId,
  saveFinding,
  buildFindingReportPreview,
  findingReport,
  setNotice,
  buildReportRef
}: {
  findings: Finding[];
  selectedFinding: Finding | null;
  setFindingTemplateId: (value: FindingTemplateId) => void;
  saveFinding: (finding: Finding) => Promise<Finding | null>;
  buildFindingReportPreview: (
    options: Partial<FindingReportOptions>
  ) => Promise<FindingReport | null>;
  findingReport: FindingReport | null;
  setNotice: (message: string) => void;
  buildReportRef?: { current: (() => void) | null };
}) {
  const [findingDraft, setFindingDraft] = useState<Finding | null>(
    null
  );
  const [findingReportFormat, setFindingReportFormat] = useState<
    "markdown" | "html"
  >("markdown");
  const [findingReportPreset, setFindingReportPreset] =
    useState<FindingReportPreset>("client-report");
  const [findingReportTitle, setFindingReportTitle] = useState(
    "Radar Client Report"
  );
  const [findingReportIncludeDrafts, setFindingReportIncludeDrafts] =
    useState(false);
  const [findingReportIncludeRaw, setFindingReportIncludeRaw] =
    useState(false);
  const [
    findingReportExecutiveSummary,
    setFindingReportExecutiveSummary
  ] = useState("");
  const [findingReportMethodology, setFindingReportMethodology] =
    useState("");
  const [findingReportScopeSummary, setFindingReportScopeSummary] =
    useState("");
  const [findingReportLimitations, setFindingReportLimitations] =
    useState("");
  const [findingReportChangeLog, setFindingReportChangeLog] =
    useState("");
  const [findingStatusFilter, setFindingStatusFilter] = useState<
    FindingStatus | "all"
  >("all");
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<
    FindingSeverity | "all"
  >("all");
  const [findingOwnerFilter, setFindingOwnerFilter] = useState("all");
  const [findingComponentFilter, setFindingComponentFilter] =
    useState("all");
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
            .flatMap((finding) => [
              finding.owner,
              finding.assignee
            ])
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
      if (
        findingStatusFilter !== "all" &&
        finding.status !== findingStatusFilter
      ) {
        return false;
      }
      if (
        findingSeverityFilter !== "all" &&
        finding.severity !== findingSeverityFilter
      ) {
        return false;
      }
      if (
        findingOwnerFilter !== "all" &&
        finding.owner.trim() !== findingOwnerFilter &&
        finding.assignee.trim() !== findingOwnerFilter
      ) {
        return false;
      }
      if (
        findingComponentFilter !== "all" &&
        finding.component.trim() !== findingComponentFilter
      ) {
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
    setFindingDraft((current) =>
      current ? { ...current, ...patch } : current
    );
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
      affectedAssets: findingDraft.affectedAssets
        .map((asset) => asset.trim())
        .filter(Boolean),
      updatedAt: new Date().toISOString(),
      reviewedAt:
        findingDraft.status === "reviewed" &&
        !findingDraft.reviewedAt
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
    const extension =
      findingReport.format === "html" ? "html" : "md";
    const blob = new window.Blob([findingReport.body], {
      type:
        findingReport.format === "html"
          ? "text/html"
          : "text/markdown"
    });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `radar-findings.${extension}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return {
    findingDraft,
    findingReportFormat,
    setFindingReportFormat,
    findingReportPreset,
    setFindingReportPreset,
    findingReportTitle,
    setFindingReportTitle,
    findingReportIncludeDrafts,
    setFindingReportIncludeDrafts,
    findingReportIncludeRaw,
    setFindingReportIncludeRaw,
    findingReportExecutiveSummary,
    setFindingReportExecutiveSummary,
    findingReportMethodology,
    setFindingReportMethodology,
    findingReportScopeSummary,
    setFindingReportScopeSummary,
    findingReportLimitations,
    setFindingReportLimitations,
    findingReportChangeLog,
    setFindingReportChangeLog,
    findingStatusFilter,
    setFindingStatusFilter,
    findingSeverityFilter,
    setFindingSeverityFilter,
    findingOwnerFilter,
    setFindingOwnerFilter,
    findingComponentFilter,
    setFindingComponentFilter,
    findingTextFilter,
    setFindingTextFilter,
    findingOwnerOptions,
    findingComponentOptions,
    filteredFindings,
    updateFindingDraft,
    saveFindingDraft,
    buildFindingReport,
    copyFindingReport,
    downloadFindingReport
  };
}
