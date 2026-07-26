import { useCallback, useMemo, useState } from "react";
import {
  evidenceRefFromAutomateResult,
  evidenceRefFromCapture,
  evidenceRefFromWebSocket,
  FINDING_TEMPLATES,
  findingFromTemplate,
  buildRetestMatrix,
  mergeFindings as mergeFindingRecords,
  normalizeFinding,
  suggestFindingMerges
} from "../../../shared/findings.js";
import { originFromUrl } from "../../lib";
import type {
  AutomateResult,
  AutomateSession,
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  FindingEvidenceRef,
  FindingReport,
  FindingReportOptions,
  FindingTemplateId,
  WebSocketEvent
} from "../../types";

import type { WorkView } from "./viewMeta";

export interface UseFindingsDomainArgs {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
}

export type FindingsDomain = ReturnType<typeof useFindingsDomain>;

export function useFindingsDomain({ setNotice, setActiveView }: UseFindingsDomainArgs) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [findingReport, setFindingReport] = useState<FindingReport | null>(null);
  const [evidenceAnnotations, setEvidenceAnnotations] = useState<EvidenceAnnotation[]>([]);

  const selectedFinding = useMemo(
    () => findings.find((finding) => finding.id === selectedFindingId) || findings[0] || null,
    [findings, selectedFindingId]
  );

  const findingMergeSuggestions = useMemo(() => suggestFindingMerges(findings), [findings]);

  const findingRetestMatrix = useMemo(() => buildRetestMatrix(findings), [findings]);

  const saveFinding = useCallback(async (finding: Finding) => {
    if (!window.radar?.saveFinding) {
      setNotice("Run in Electron to save findings.");
      return null;
    }
    try {
      const saved = await window.radar.saveFinding(finding);
      setFindings((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedFindingId(saved.id);
      setNotice("Finding saved");
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Finding save failed");
      return null;
    }
  }, [setNotice]);

  const deleteFinding = useCallback(
    async (findingId = selectedFinding?.id || "") => {
      if (!findingId || !window.radar?.deleteFinding) {
        return;
      }
      await window.radar.deleteFinding(findingId);
      setFindings((items) => items.filter((finding) => finding.id !== findingId));
      setSelectedFindingId((current) => (current === findingId ? "" : current));
      setNotice("Finding deleted");
    },
    [selectedFinding, setNotice]
  );

  const saveFindingPatch = useCallback(
    async (patch: Partial<Finding>) => {
      if (!selectedFinding) {
        return null;
      }
      const status = patch.status || selectedFinding.status;
      const now = new Date().toISOString();
      const normalized = normalizeFinding({
        ...selectedFinding,
        ...patch,
        reviewedAt: status === "reviewed" && !selectedFinding.reviewedAt ? now : patch.reviewedAt || selectedFinding.reviewedAt,
        updatedAt: now
      });
      if (!normalized) {
        setNotice("Finding needs a title and evidence before saving.");
        return null;
      }
      return saveFinding(normalized);
    },
    [saveFinding, selectedFinding, setNotice]
  );

  const createFindingWithEvidence = useCallback(
    async (templateId: FindingTemplateId, evidence: FindingEvidenceRef[], overrides: Partial<Finding> = {}) => {
      const base = findingFromTemplate(templateId, evidence);
      const normalized = normalizeFinding({
        ...base,
        ...overrides,
        evidence,
        updatedAt: new Date().toISOString()
      });
      if (!normalized) {
        setNotice("Select evidence before creating a finding.");
        return null;
      }
      const saved = await saveFinding(normalized);
      if (saved) {
        setActiveView("findings");
      }
      return saved;
    },
    [saveFinding, setNotice, setActiveView]
  );

  const createFindingFromCapture = useCallback(
    (capture: CapturedRequest | null, templateId: FindingTemplateId = "headers") => {
      if (!capture) {
        setNotice("Select a capture before creating a finding.");
        return Promise.resolve(null);
      }
      return createFindingWithEvidence(templateId, [evidenceRefFromCapture(capture)], {
        affectedAssets: [originFromUrl(capture.url) || capture.url],
        reproductionSteps: `${capture.method} ${capture.url}`,
        notes: capture.status ? `Observed HTTP ${capture.status} ${capture.statusText}` : ""
      });
    },
    [createFindingWithEvidence, setNotice]
  );

  const createFindingFromWebSocket = useCallback(
    (event: WebSocketEvent | null, templateId: FindingTemplateId = "information-disclosure") => {
      if (!event) {
        setNotice("Select a WebSocket frame before creating a finding.");
        return Promise.resolve(null);
      }
      return createFindingWithEvidence(templateId, [evidenceRefFromWebSocket(event)], {
        affectedAssets: [originFromUrl(event.url) || event.url],
        reproductionSteps: `${event.direction} ${event.url}`,
        notes: event.error || event.payloadData.slice(0, 240)
      });
    },
    [createFindingWithEvidence, setNotice]
  );

  const promoteAutomateResultToFinding = useCallback(async (activeAutomateSession: AutomateSession | null, selectedAutomateResult: AutomateResult | null) => {
    if (!activeAutomateSession || !selectedAutomateResult || !window.radar?.promoteAutomateResultToFinding) {
      return null;
    }
    try {
      const finding = await window.radar.promoteAutomateResultToFinding({
        sessionId: activeAutomateSession.id,
        resultId: selectedAutomateResult.id
      });
      setFindings((items) => [finding, ...items.filter((item) => item.id !== finding.id)]);
      setSelectedFindingId(finding.id);
      setActiveView("findings");
      setNotice("Promoted Automate result to draft finding");
      return finding;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Finding promotion failed");
      return null;
    }
  }, [setNotice, setActiveView]);

  const attachEvidenceToFinding = useCallback(
    async (refs: FindingEvidenceRef[]) => {
      if (!selectedFinding || refs.length === 0) {
        return null;
      }
      const existing = new Map(selectedFinding.evidence.map((ref) => [`${ref.kind}:${ref.id}`, ref]));
      refs.forEach((ref) => existing.set(`${ref.kind}:${ref.id}`, ref));
      return saveFindingPatch({ evidence: Array.from(existing.values()) });
    },
    [saveFindingPatch, selectedFinding]
  );

  const attachSelectedCaptureToFinding = useCallback(
    (capture: CapturedRequest | null) => {
      if (!capture) {
        setNotice("Select a capture before attaching retest evidence.");
        return Promise.resolve(null);
      }
      return attachEvidenceToFinding([evidenceRefFromCapture(capture)]);
    },
    [attachEvidenceToFinding, setNotice]
  );

  const attachSelectedAutomateResultToFinding = useCallback((activeAutomateSession: AutomateSession | null, selectedAutomateResult: AutomateResult | null) => {
    if (!activeAutomateSession || !selectedAutomateResult) {
      setNotice("Select an Automate result before attaching evidence.");
      return Promise.resolve(null);
    }
    return attachEvidenceToFinding([evidenceRefFromAutomateResult(activeAutomateSession, selectedAutomateResult)]);
  }, [attachEvidenceToFinding, setNotice]);

  const mergeFindingPair = useCallback(
    async (primaryId: string, duplicateId: string) => {
      const primary = findings.find((finding) => finding.id === primaryId);
      const duplicate = findings.find((finding) => finding.id === duplicateId);
      if (!primary || !duplicate || primary.id === duplicate.id) {
        setNotice("Select two finding records before merging.");
        return null;
      }
      if (!window.radar?.saveFinding || !window.radar?.deleteFinding) {
        setNotice("Run in Electron to merge findings.");
        return null;
      }
      const merged = mergeFindingRecords(primary, duplicate);
      const saved = await window.radar.saveFinding(merged);
      await window.radar.deleteFinding(duplicate.id);
      setFindings((items) => [saved, ...items.filter((finding) => finding.id !== saved.id && finding.id !== duplicate.id)]);
      setSelectedFindingId(saved.id);
      setNotice(`Merged duplicate finding into ${saved.title}`);
      return saved;
    },
    [findings, setNotice]
  );

  const buildFindingReportPreview = useCallback(async (options: Partial<FindingReportOptions>) => {
    if (!window.radar?.buildFindingReport) {
      setNotice("Run in Electron to build reports.");
      return null;
    }
    const report = await window.radar.buildFindingReport(options);
    setFindingReport(report);
    setNotice(`Report preview ready: ${report.findingCount} findings`);
    return report;
  }, [setNotice]);

  return {
    findings,
    setFindings,
    selectedFindingId,
    setSelectedFindingId,
    findingReport,
    setFindingReport,
    evidenceAnnotations,
    setEvidenceAnnotations,
    selectedFinding,
    findingMergeSuggestions,
    findingRetestMatrix,
    findingTemplates: FINDING_TEMPLATES,
    saveFinding,
    deleteFinding,
    saveFindingPatch,
    createFindingWithEvidence,
    createFindingFromCapture,
    createFindingFromWebSocket,
    promoteAutomateResultToFinding,
    attachEvidenceToFinding,
    attachSelectedCaptureToFinding,
    attachSelectedAutomateResultToFinding,
    mergeFindingPair,
    buildFindingReportPreview
  };
}
