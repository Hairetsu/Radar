import { useCallback, useMemo, useState } from "react";
import {
  assignmentsForPayload,
  createAutomatePayloadSet,
  createAutomatePayloadMarker,
  findAutomatePayloadPositions,
  insertAutomatePayloadMarker,
  materializeAutomateDraft,
  normalizeAutomateLimits,
  normalizeAutomatePayloads,
  normalizeAutomatePayloadSets,
  normalizeAutomateRules,
  type AutomatePayloadLocation
} from "../../../shared/automate.js";
import { formatHeaders } from "../../lib";
import type {
  AutomateLimits,
  AutomatePayloadSet,
  AutomateResult,
  AutomateSession,
  BurstResult,
  ReplayDraft,
  ReplayResult,
  ReplayTabState
} from "../../types";
import type { WorkView } from "./viewMeta";

const defaultAutomateRulesText = JSON.stringify(
  [
    { id: "rule-status-500", name: "Server errors", enabled: true, kind: "match", target: "status", status: 500 },
    { id: "rule-error-copy", name: "Error copy", enabled: true, kind: "match", target: "body", pattern: "error" }
  ],
  null,
  2
);

const defaultAutomateLimits: AutomateLimits = {
  count: 10,
  concurrency: 1,
  delayMs: 100,
  timeoutMs: 10000
};

function parseAutomateRulesText(text: string) {
  try {
    const parsed: unknown = JSON.parse(text || "[]");
    return normalizeAutomateRules(parsed);
  } catch {
    return [];
  }
}

function automatePayloadSetText(payloadSet: AutomatePayloadSet | null) {
  return payloadSet ? payloadSet.payloads.join("\n") : "";
}

function sortAutomateResults(results: AutomateResult[], sort: string) {
  const sorted = [...results];
  if (sort === "status") {
    return sorted.sort((left, right) => right.status - left.status || left.index - right.index);
  }
  if (sort === "length") {
    return sorted.sort((left, right) => right.length - left.length || left.index - right.index);
  }
  if (sort === "latency") {
    return sorted.sort((left, right) => right.latencyMs - left.latencyMs || left.index - right.index);
  }
  if (sort === "matches") {
    return sorted.sort(
      (left, right) =>
        right.matchedRules.length + right.extracts.length - (left.matchedRules.length + left.extracts.length) ||
        left.index - right.index
    );
  }
  return sorted.sort((left, right) => left.index - right.index);
}

export interface UseAutomateDomainArgs {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setDraft: (draft: ReplayDraft) => void;
  setHeadersText: (text: string) => void;
  setLastResponse: (response: ReplayResult | null) => void;
  setLastBurst: (burst: BurstResult | null) => void;
  setReplayTabState: (state: ReplayTabState) => void;
  automateBaseDraft: ReplayDraft;
  activeReplayTabEnvironmentId?: string;
}

export type AutomateDomain = ReturnType<typeof useAutomateDomain>;

export function useAutomateDomain({
  setNotice,
  setActiveView,
  setDraft,
  setHeadersText,
  setLastResponse,
  setLastBurst,
  setReplayTabState,
  automateBaseDraft,
  activeReplayTabEnvironmentId
}: UseAutomateDomainArgs) {
  const [automateMarkerName, setAutomateMarkerName] = useState("probe");
  const [automateHeaderName, setAutomateHeaderName] = useState("X-Radar-Payload");
  const [automatePayloadText, setAutomatePayloadText] = useState("test\nadmin\ntrue");
  const [automatePayloadSets, setAutomatePayloadSets] = useState<AutomatePayloadSet[]>([]);
  const [selectedAutomatePayloadSetId, setSelectedAutomatePayloadSetId] = useState("");
  const [automatePayloadSetName, setAutomatePayloadSetName] = useState("Probe deck");
  const [automateWordlistPath, setAutomateWordlistPath] = useState("");
  const [automateSessionName, setAutomateSessionName] = useState("Payload run");
  const [automateLimits, setAutomateLimits] = useState<AutomateLimits>(defaultAutomateLimits);
  const [automateRulesText, setAutomateRulesText] = useState(defaultAutomateRulesText);
  const [automateSessions, setAutomateSessions] = useState<AutomateSession[]>([]);
  const [activeAutomateSessionId, setActiveAutomateSessionId] = useState("");
  const [selectedAutomateResultId, setSelectedAutomateResultId] = useState("");
  const [automateResultFilter, setAutomateResultFilter] = useState("all");
  const [automateResultSort, setAutomateResultSort] = useState("index");

  const automateMarkerPreview = useMemo(
    () => createAutomatePayloadMarker(automateMarkerName),
    [automateMarkerName]
  );

  const automatePositions = useMemo(() => findAutomatePayloadPositions(automateBaseDraft), [automateBaseDraft]);

  const automatePayloads = useMemo(() => normalizeAutomatePayloads(automatePayloadText), [automatePayloadText]);

  const automatePreviewDraft = useMemo(() => {
    if (automatePositions.length === 0 || automatePayloads.length === 0) {
      return automateBaseDraft;
    }
    return materializeAutomateDraft(
      automateBaseDraft,
      assignmentsForPayload(automatePositions, automatePayloads[0])
    );
  }, [automateBaseDraft, automatePayloads, automatePositions]);

  const selectedAutomatePayloadSet = useMemo(
    () => automatePayloadSets.find((payloadSet) => payloadSet.id === selectedAutomatePayloadSetId) || null,
    [automatePayloadSets, selectedAutomatePayloadSetId]
  );

  const automateRules = useMemo(() => parseAutomateRulesText(automateRulesText), [automateRulesText]);

  const activeAutomateSession = useMemo(
    () =>
      automateSessions.find((session) => session.id === activeAutomateSessionId) ||
      automateSessions[0] ||
      null,
    [activeAutomateSessionId, automateSessions]
  );

  const filteredAutomateResults = useMemo(() => {
    const results = activeAutomateSession?.results || [];
    const filtered = results.filter((result) => {
      if (automateResultFilter === "failures") {
        return !result.ok || result.status >= 400 || Boolean(result.error);
      }
      if (automateResultFilter === "matches") {
        return result.matchedRules.length > 0 || result.extracts.length > 0;
      }
      if (automateResultFilter === "outliers") {
        const cluster = activeAutomateSession?.clusters.find((item) => item.id === result.clusterId);
        return cluster?.count === 1;
      }
      return true;
    });
    return sortAutomateResults(filtered, automateResultSort);
  }, [activeAutomateSession, automateResultFilter, automateResultSort]);

  const selectedAutomateResult = useMemo(
    () =>
      activeAutomateSession?.results.find((result) => result.id === selectedAutomateResultId) ||
      filteredAutomateResults[0] ||
      null,
    [activeAutomateSession, filteredAutomateResults, selectedAutomateResultId]
  );

  const insertAutomateMarker = useCallback(
    (location: AutomatePayloadLocation) => {
      const next = insertAutomatePayloadMarker(automateBaseDraft, location, automateMarkerName, automateHeaderName);
      setDraft(next);
      setHeadersText(formatHeaders(next.headers));
      setActiveView("automate");
      setNotice(`Marked ${location} payload position`);
    },
    [automateBaseDraft, automateHeaderName, automateMarkerName, setDraft, setHeadersText, setActiveView, setNotice]
  );

  const loadAutomatePreviewIntoRepeater = useCallback(() => {
    if (automatePositions.length === 0 || automatePayloads.length === 0) {
      setNotice("Add a payload marker and payload first.");
      return;
    }
    setDraft(automatePreviewDraft);
    setHeadersText(formatHeaders(automatePreviewDraft.headers));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded Automate preview in Repeater");
  }, [automatePayloads.length, automatePositions.length, automatePreviewDraft, setDraft, setHeadersText, setLastResponse, setLastBurst, setActiveView, setNotice]);

  const selectAutomatePayloadSet = useCallback(
    (id: string) => {
      setSelectedAutomatePayloadSetId(id);
      const payloadSet = automatePayloadSets.find((item) => item.id === id) || null;
      if (payloadSet) {
        setAutomatePayloadText(automatePayloadSetText(payloadSet));
        setAutomatePayloadSetName(payloadSet.name);
        setAutomateWordlistPath(payloadSet.wordlistPath || "");
        setNotice(`Loaded payload set ${payloadSet.name}`);
      }
    },
    [automatePayloadSets, setNotice]
  );

  const saveAutomatePayloadSet = useCallback(async () => {
    const payloadSet = createAutomatePayloadSet({
      name: automatePayloadSetName,
      payloads: automatePayloads,
      source: "inline"
    });
    if (!payloadSet) {
      setNotice("Add at least one payload before saving a set.");
      return;
    }
    const next = normalizeAutomatePayloadSets([
      payloadSet,
      ...automatePayloadSets.filter((item) => item.id !== payloadSet.id && item.name !== payloadSet.name)
    ]);
    const saved = (await window.radar?.setAutomatePayloadSets?.(next)) || next;
    setAutomatePayloadSets(saved);
    setSelectedAutomatePayloadSetId(payloadSet.id);
    setNotice(`Saved payload set ${payloadSet.name}`);
  }, [automatePayloadSetName, automatePayloadSets, automatePayloads, setNotice]);

  const saveAutomateWordlistReference = useCallback(async () => {
    const payloadSet = createAutomatePayloadSet({
      name: automatePayloadSetName || "Wordlist reference",
      payloads: automatePayloads,
      source: "wordlist",
      wordlistPath: automateWordlistPath
    });
    if (!payloadSet) {
      setNotice("Add a wordlist path or sample payloads before saving.");
      return;
    }
    const next = normalizeAutomatePayloadSets([
      payloadSet,
      ...automatePayloadSets.filter((item) => item.id !== payloadSet.id && item.name !== payloadSet.name)
    ]);
    const saved = (await window.radar?.setAutomatePayloadSets?.(next)) || next;
    setAutomatePayloadSets(saved);
    setSelectedAutomatePayloadSetId(payloadSet.id);
    setNotice(`Saved wordlist reference ${payloadSet.name}`);
  }, [automatePayloadSetName, automatePayloadSets, automatePayloads, automateWordlistPath, setNotice]);

  const updateAutomateLimits = useCallback((patch: Partial<AutomateLimits>) => {
    setAutomateLimits((current) => normalizeAutomateLimits({ ...current, ...patch }));
  }, []);

  const refreshAutomateSessions = useCallback(async () => {
    if (!window.radar?.listAutomateSessions) {
      return [];
    }
    const sessions = await window.radar.listAutomateSessions();
    setAutomateSessions(sessions);
    return sessions;
  }, []);

  const startAutomateSession = useCallback(async () => {
    if (!window.radar?.startAutomateSession) {
      setNotice("Run in Electron to start Automate sessions.");
      return;
    }
    if (automatePositions.length === 0) {
      setNotice("Add at least one payload marker before starting.");
      return;
    }
    if (automatePayloads.length === 0) {
      setNotice("Add at least one payload before starting.");
      return;
    }
    const session = await window.radar.startAutomateSession({
      name: automateSessionName,
      draft: automateBaseDraft,
      environmentId: activeReplayTabEnvironmentId || "",
      payloadSetId: selectedAutomatePayloadSetId || undefined,
      payloads: automatePayloads,
      positions: automatePositions,
      limits: automateLimits,
      rules: automateRules
    });
    setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
    setActiveAutomateSessionId(session.id);
    setSelectedAutomateResultId("");
    setActiveView("automate");
    setNotice(`Automate started with ${session.payloads.length} payloads`);
  }, [
    activeReplayTabEnvironmentId,
    automateBaseDraft,
    automateLimits,
    automatePayloads,
    automatePositions,
    automateRules,
    automateSessionName,
    selectedAutomatePayloadSetId,
    setNotice,
    setActiveView
  ]);

  const pauseAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.pauseAutomateSession) {
      return;
    }
    const session = await window.radar.pauseAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate paused");
    }
  }, [activeAutomateSession, setNotice]);

  const resumeAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.resumeAutomateSession) {
      return;
    }
    const session = await window.radar.resumeAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate resumed");
    }
  }, [activeAutomateSession, setNotice]);

  const stopAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.stopAutomateSession) {
      return;
    }
    const session = await window.radar.stopAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate stopped");
    }
  }, [activeAutomateSession, setNotice]);

  const retryAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.retryAutomateSession) {
      return;
    }
    const session = await window.radar.retryAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate retry queued");
    }
  }, [activeAutomateSession, setNotice]);

  const promoteAutomateResultToRepeater = useCallback(
    async (resultId = selectedAutomateResult?.id || "") => {
      if (!activeAutomateSession || !resultId || !window.radar?.promoteAutomateResultToRepeater) {
        return;
      }
      const state = await window.radar.promoteAutomateResultToRepeater({
        sessionId: activeAutomateSession.id,
        resultId
      });
      setReplayTabState(state);
      setActiveView("repeater");
      setNotice("Promoted Automate result to Repeater");
    },
    [activeAutomateSession, selectedAutomateResult, setReplayTabState, setActiveView, setNotice]
  );

  return {
    automateMarkerName,
    setAutomateMarkerName,
    automateHeaderName,
    setAutomateHeaderName,
    automatePayloadText,
    setAutomatePayloadText,
    automatePayloadSets,
    setAutomatePayloadSets,
    selectedAutomatePayloadSetId,
    setSelectedAutomatePayloadSetId,
    selectedAutomatePayloadSet,
    selectAutomatePayloadSet,
    automatePayloadSetName,
    setAutomatePayloadSetName,
    automateWordlistPath,
    setAutomateWordlistPath,
    saveAutomatePayloadSet,
    saveAutomateWordlistReference,
    automateSessionName,
    setAutomateSessionName,
    automateLimits,
    setAutomateLimits,
    updateAutomateLimits,
    automateRulesText,
    setAutomateRulesText,
    automateRules,
    automateSessions,
    setAutomateSessions,
    activeAutomateSessionId,
    setActiveAutomateSessionId,
    activeAutomateSession,
    selectedAutomateResultId,
    setSelectedAutomateResultId,
    selectedAutomateResult,
    automateResultFilter,
    setAutomateResultFilter,
    automateResultSort,
    setAutomateResultSort,
    filteredAutomateResults,
    startAutomateSession,
    pauseAutomateSession,
    resumeAutomateSession,
    stopAutomateSession,
    retryAutomateSession,
    promoteAutomateResultToRepeater,
    refreshAutomateSessions,
    automateMarkerPreview,
    automatePositions,
    automatePayloads,
    automatePreviewDraft,
    insertAutomateMarker,
    loadAutomatePreviewIntoRepeater
  };
}
