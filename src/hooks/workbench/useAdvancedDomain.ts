import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildAdvancedTestingSummary,
  workflowDraftFromApiImport,
  workflowDraftFromAuthMatrixRow,
  workflowDraftFromGraphQlOperation,
  workflowDraftFromHeaderSignal,
  workflowDraftFromParameter,
  workflowDraftFromSecret
} from "../../../shared/advancedTesting.js";
import { createCollectionItem, normalizeReplayCollections } from "../../../shared/replayCollections.js";
import { formatHeaders } from "../../lib";
import type { CapturedRequest, ReplayCollection, ReplayDraft, WebSocketEvent, WorkflowDefinition } from "../../types";
import type { WorkView } from "./viewMeta";

interface AdvancedDomainPorts {
  replayCollections: ReplayCollection[];
  saveReplayCollections: (collections: ReplayCollection[]) => Promise<unknown>;
  setDraft: (draft: ReplayDraft) => void;
  setHeadersText: (text: string) => void;
  setLastResponse: (response: null) => void;
  setLastBurst: (burst: null) => void;
  setActiveView: (view: WorkView) => void;
  setNotice: (message: string) => void;
  setAiPreparedWorkflowDraft: (draft: WorkflowDefinition | null) => void;
  setSelectedWorkflowId: (id: string) => void;
}

export function useAdvancedDomain(
  captures: CapturedRequest[],
  webSocketEvents: WebSocketEvent[],
  targets: string[],
  ports: AdvancedDomainPorts
) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [advancedImportText, setAdvancedImportText] = useState("");

  const advancedSummary = useMemo(
    () => buildAdvancedTestingSummary(captures, webSocketEvents, advancedImportText, targets[0] || ""),
    [advancedImportText, captures, targets, webSocketEvents]
  );

  const saveAdvancedImportAsCollection = useCallback(async () => {
    if (!advancedSummary.apiImport.ok || advancedSummary.apiImport.replayTemplates.length === 0) {
      portsRef.current.setNotice("Paste a supported OpenAPI or Postman document before saving a collection.");
      return null;
    }
    const now = new Date().toISOString();
    const collectionName = advancedSummary.apiImport.drafts[0]?.collectionName || "Advanced import";
    const collection: ReplayCollection = {
      id: `collection-advanced-${now.replace(/[^0-9]/g, "")}`,
      name: collectionName,
      items: advancedSummary.apiImport.drafts.map((draft, index) => ({
        ...createCollectionItem(
          draft.path || `Imported request ${index + 1}`,
          advancedSummary.apiImport.replayTemplates[index],
          now
        ),
        id: `item-advanced-${now.replace(/[^0-9]/g, "")}-${index + 1}`,
        tags: ["advanced-import", draft.sourceType, ...draft.tags].slice(0, 12)
      })),
      createdAt: now,
      updatedAt: now
    };
    const next = normalizeReplayCollections([collection, ...portsRef.current.replayCollections], now);
    await portsRef.current.saveReplayCollections(next);
    portsRef.current.setActiveView("repeater");
    portsRef.current.setNotice(`Saved ${collection.items.length} imported templates to ${collection.name}`);
    return collection;
  }, [advancedSummary.apiImport]);

  const loadAdvancedImportDraftToRepeater = useCallback((draftId?: string) => {
    const draft =
      advancedSummary.apiImport.drafts.find((item) => item.id === draftId) ||
      advancedSummary.apiImport.drafts[0] ||
      null;
    if (!draft) {
      portsRef.current.setNotice("Paste a supported API import before loading a template.");
      return;
    }
    const replayDraft = {
      method: draft.method,
      url: draft.url,
      headers: draft.headers,
      body: draft.body
    };
    portsRef.current.setDraft(replayDraft);
    portsRef.current.setHeadersText(formatHeaders(replayDraft.headers));
    portsRef.current.setLastResponse(null);
    portsRef.current.setLastBurst(null);
    portsRef.current.setActiveView("repeater");
    portsRef.current.setNotice(`Loaded imported ${draft.method} ${draft.path} in Repeater`);
  }, [advancedSummary.apiImport.drafts]);

  const prepareAdvancedWorkflowDraft = useCallback(
    (
      kind: "api-import" | "graphql" | "auth-row" | "parameter" | "header-signal" | "secret",
      id?: string
    ) => {
      let workflow: WorkflowDefinition | null = null;
      if (kind === "api-import") {
        workflow = workflowDraftFromApiImport(advancedSummary.apiImport);
      } else if (kind === "graphql") {
        const operation =
          advancedSummary.graphql.operations.find((item) => item.id === id) ||
          advancedSummary.graphql.operations[0];
        workflow = operation ? workflowDraftFromGraphQlOperation(operation) : null;
      } else if (kind === "auth-row") {
        const row = advancedSummary.authMatrix.find((item) => item.id === id) || advancedSummary.authMatrix[0];
        workflow = row ? workflowDraftFromAuthMatrixRow(row) : null;
      } else if (kind === "parameter") {
        const parameter =
          advancedSummary.parameters.find((item) => item.id === id) || advancedSummary.parameters[0];
        workflow = parameter ? workflowDraftFromParameter(parameter) : null;
      } else if (kind === "header-signal") {
        const signal =
          advancedSummary.headerSignals.find((item) => item.id === id) || advancedSummary.headerSignals[0];
        workflow = signal ? workflowDraftFromHeaderSignal(signal) : null;
      } else {
        const secret = advancedSummary.secrets.find((item) => item.id === id) || advancedSummary.secrets[0];
        workflow = secret ? workflowDraftFromSecret(secret) : null;
      }
      if (!workflow) {
        portsRef.current.setNotice("No Advanced signal is available for a workflow draft.");
        return null;
      }
      portsRef.current.setAiPreparedWorkflowDraft(workflow);
      portsRef.current.setSelectedWorkflowId(workflow.id);
      portsRef.current.setActiveView("workflows");
      portsRef.current.setNotice(`Prepared workflow draft: ${workflow.name}`);
      return workflow;
    },
    [advancedSummary]
  );

  return {
    advancedImportText,
    setAdvancedImportText,
    advancedSummary,
    saveAdvancedImportAsCollection,
    loadAdvancedImportDraftToRepeater,
    prepareAdvancedWorkflowDraft
  };
}
