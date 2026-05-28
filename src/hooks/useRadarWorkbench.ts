import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_URL as defaultUrl,
  firstUrlFromText,
  formatHeaders,
  isAllowedTarget,
  normalizeUrl,
  originFromUrl,
  parseHeaders
} from "../lib";
import type {
  BrowserState,
  BurstResult,
  CapturedRequest,
  AgentRun,
  AppMode,
  LocalContext,
  LocalProfile,
  LocalSessionSummary,
  ProxyState,
  ReplayDraft,
  ReplayResult,
  SslEvent
} from "../types";
import { useAsyncAction } from "./useAsyncAction";
import { useAiConnection } from "./useAiConnection";
import { useTheme } from "./useTheme";

export type WorkView = "traffic" | "repeater" | "scope" | "ssl";

export const WORK_VIEWS: WorkView[] = ["traffic", "repeater", "scope", "ssl"];

export type TrafficSortField = "time" | "method" | "status" | "host" | "path" | "type" | "duration";

export type TrafficSortDirection = "asc" | "desc";

export const TRAFFIC_SORT_FIELDS: { value: TrafficSortField; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "method", label: "Method" },
  { value: "status", label: "Status" },
  { value: "host", label: "Host" },
  { value: "path", label: "Path" },
  { value: "type", label: "Type" },
  { value: "duration", label: "Duration" }
];

const emptyDraft: ReplayDraft = {
  method: "GET",
  url: defaultUrl,
  headers: {
    Accept: "application/json, text/plain, */*"
  },
  body: ""
};

const defaultBrowserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};

const defaultProxyState: ProxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};

function storedAppMode(): AppMode {
  if (typeof window === "undefined") {
    return "manual-first";
  }
  return window.localStorage.getItem("radar.appMode") === "ai-first" ? "ai-first" : "manual-first";
}

function isActiveAgentRun(run: AgentRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

export const viewMeta: Record<WorkView, { num: string; label: string; eyebrow: string; title: string }> = {
  traffic: { num: "01", label: "Traffic", eyebrow: "Capture // Live wire", title: "Traffic" },
  repeater: { num: "02", label: "Repeater", eyebrow: "Replay // Surface probe", title: "Repeater" },
  scope: { num: "03", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "04", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
};

const methodSortOrder = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function defaultSessionName(createdAt = new Date()) {
  return `Session ${createdAt.toISOString().slice(0, 16).replace("T", " ")}`;
}

function compareMethods(left: string, right: string) {
  const leftIndex = methodSortOrder.indexOf(left);
  const rightIndex = methodSortOrder.indexOf(right);
  const normalizedLeft = leftIndex === -1 ? methodSortOrder.length : leftIndex;
  const normalizedRight = rightIndex === -1 ? methodSortOrder.length : rightIndex;
  return normalizedLeft - normalizedRight || left.localeCompare(right);
}

function sortedMethods(methods: string[]) {
  return [...methods].sort(compareMethods);
}

function compareNullableNumber(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function compareTrafficCaptures(
  left: CapturedRequest,
  right: CapturedRequest,
  field: TrafficSortField,
  direction: TrafficSortDirection
) {
  let result = 0;
  switch (field) {
    case "time":
      result = left.startedAt.localeCompare(right.startedAt);
      break;
    case "method":
      result = compareMethods(left.method, right.method);
      break;
    case "status":
      result = compareNullableNumber(left.status, right.status);
      break;
    case "host":
      result = left.host.localeCompare(right.host);
      break;
    case "path":
      result = left.path.localeCompare(right.path);
      break;
    case "type":
      result = (left.type || left.source).localeCompare(right.type || right.source);
      break;
    case "duration":
      result = compareNullableNumber(left.durationMs, right.durationMs);
      break;
  }
  if (result === 0) {
    result = left.id.localeCompare(right.id);
  }
  return direction === "asc" ? result : -result;
}

function serializeHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function searchTextForCapture(capture: CapturedRequest) {
  return [
    capture.method,
    capture.url,
    capture.host,
    capture.path,
    capture.status,
    capture.statusText,
    capture.mimeType,
    capture.type,
    capture.source,
    serializeHeaders(capture.requestHeaders),
    capture.requestBody,
    serializeHeaders(capture.responseHeaders),
    capture.responseBody
  ]
    .filter((value) => value !== null && value !== undefined)
    .join("\n")
    .toLowerCase();
}

export function useRadarWorkbench() {
  const [address, setAddress] = useState(defaultUrl);
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [sslEvents, setSslEvents] = useState<SslEvent[]>([]);
  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [profileSessionOpen, setProfileSessionOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [browserState, setBrowserState] = useState<BrowserState>(defaultBrowserState);
  const [proxyState, setProxyState] = useState<ProxyState>(defaultProxyState);
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef("");
  const [targets, setTargets] = useState<string[]>([]);
  const [targetText, setTargetText] = useState("");
  const [trafficMethodFilter, setTrafficMethodFilter] = useState("all");
  const [trafficTypeFilter, setTrafficTypeFilter] = useState("all");
  const [trafficSearch, setTrafficSearch] = useState("");
  const [trafficSortField, setTrafficSortField] = useState<TrafficSortField>("time");
  const [trafficSortDirection, setTrafficSortDirection] = useState<TrafficSortDirection>("desc");
  const [draft, setDraft] = useState<ReplayDraft>(emptyDraft);
  const [headersText, setHeadersText] = useState(formatHeaders(emptyDraft.headers));
  const [activeView, setActiveView] = useState<WorkView>("traffic");
  const [activeDetail, setActiveDetail] = useState<"request" | "response">("request");
  const [lastResponse, setLastResponse] = useState<ReplayResult | null>(null);
  const [lastBurst, setLastBurst] = useState<BurstResult | null>(null);
  const [count, setCount] = useState(5);
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(250);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [aiPaletteOpen, setAiPaletteOpen] = useState(false);
  const [appMode, setAppModeState] = useState<AppMode>(storedAppMode);
  const [agentGoal, setAgentGoal] = useState("");
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const agentUiCursorRef = useRef<{ runId: string; entryId: string } | null>(null);
  const ai = useAiConnection();
  const appearance = useTheme();

  const refreshLocalLists = useCallback(async (context: LocalContext) => {
    if (!window.radar) {
      return;
    }
    const [nextProfiles, nextSessions] = await Promise.all([
      window.radar.listLocalProfiles(),
      window.radar.listLocalSessions(context.profile.id)
    ]);
    setProfiles(nextProfiles);
    setSessions(nextSessions);
  }, []);

  const applyLocalContext = useCallback(
    async (context: LocalContext, noticeText?: string) => {
      setLocalContext(context);
      setProfileName(context.profile.name);
      setSessionName(context.session.name);
      setSelectedId("");
      setSelectedIds([]);
      selectionAnchorRef.current = "";
      setLastResponse(null);
      setLastBurst(null);

      if (window.radar) {
        const [nextTargets, nextCaptures, nextSslEvents, nextBrowserState, nextAgentRuns] = await Promise.all([
          window.radar.getTargets(),
          window.radar.getCaptures(),
          window.radar.getSslEvents(),
          window.radar.getBrowserState(),
          window.radar.listAgentRuns()
        ]);
        setTargets(nextTargets);
        setTargetText(nextTargets.join("\n"));
        setCaptures(nextCaptures);
        setSslEvents(nextSslEvents);
        setBrowserState(nextBrowserState);
        setAgentRuns(nextAgentRuns);
        await refreshLocalLists(context);
      }

      if (noticeText) {
        setNotice(noticeText);
      }
    },
    [refreshLocalLists]
  );

  const openBrowser = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    if (!window.radar) {
      setNotice("Run in Electron to open Chrome.");
      return;
    }
    try {
      const state = await window.radar.openBrowser(next);
      setBrowserState(state);
      setNotice(`${state.channel} launched through Radar proxy`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chrome launch failed");
    }
  }, [address]);

  const saveTargets = useCallback(async (nextText = targetText) => {
    const next = nextText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const saved = (await window.radar?.setTargets(next)) || next;
    setTargets(saved);
    setTargetText(saved.join("\n"));
    setNotice("Targets saved");
  }, [targetText]);

  const addTarget = useCallback(
    async (value: string) => {
      const origin = originFromUrl(value);
      if (!origin) {
        return;
      }
      if (targets.includes(origin)) {
        setNotice(`${origin} already in scope`);
        return;
      }
      const next = [...targets, origin];
      const saved = (await window.radar?.setTargets(next)) || next;
      setTargets(saved);
      setTargetText(saved.join("\n"));
      setNotice(`Added ${origin}`);
    },
    [targets]
  );

  const applyAiDraft = useCallback((nextDraft: ReplayDraft) => {
    setDraft(nextDraft);
    setHeadersText(formatHeaders(nextDraft.headers));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
  }, []);

  const prepareAiNavigate = useCallback((url: string) => {
    setAddress(normalizeUrl(url));
  }, []);

  const cloneToRepeater = useCallback((capture: CapturedRequest | null) => {
    if (!capture) {
      return;
    }
    setDraft({
      method: capture.method,
      url: capture.url,
      headers: capture.requestHeaders,
      body: capture.requestBody || ""
    });
    setHeadersText(formatHeaders(capture.requestHeaders));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded in repeater");
  }, []);

  const sendReplayAction = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const response = await window.radar.sendReplay(request);
      setLastResponse(response);
      setLastBurst(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Replay failed");
    }
  }, [draft, headersText]);

  const runBurstAction = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const response = await window.radar.runBurst({
        request,
        count,
        concurrency,
        delayMs
      });
      setLastBurst(response);
      setLastResponse(response.results[response.results.length - 1] || null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Burst failed");
    }
  }, [concurrency, count, delayMs, draft, headersText]);

  const sendReplayMutation = useAsyncAction(sendReplayAction);
  const runBurstMutation = useAsyncAction(runBurstAction);

  const clearCaptures = useCallback(async () => {
    await window.radar?.clearCaptures();
    setCaptures([]);
    setSelectedId("");
    setSelectedIds([]);
    selectionAnchorRef.current = "";
  }, []);

  const deleteCapture = useCallback(
    async (captureId: string) => {
      if (!captureId) {
        return;
      }
      try {
        await window.radar?.deleteCapture(captureId);
        setCaptures((items) => items.filter((capture) => capture.id !== captureId));
        setSelectedId((current) => (current === captureId ? "" : current));
        setSelectedIds((current) => current.filter((id) => id !== captureId));
        if (selectionAnchorRef.current === captureId) {
          selectionAnchorRef.current = "";
        }
        if (localContext) {
          await refreshLocalLists(localContext);
        }
        setNotice("Capture deleted");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Delete failed");
      }
    },
    [localContext, refreshLocalLists]
  );

  const openNewSessionDialog = useCallback(() => {
    setNewSessionName(defaultSessionName());
    setNewSessionOpen(true);
  }, []);

  const createLocalProfile = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to create a profile.");
      return;
    }
    const context = await window.radar.createLocalProfile(profileName);
    await applyLocalContext(context, `Profile opened: ${context.profile.name}`);
  }, [applyLocalContext, profileName]);

  const saveLocalProfile = useCallback(async () => {
    if (!window.radar || !localContext) {
      setNotice("Run in Electron to save a profile.");
      return;
    }
    const profile = await window.radar.saveLocalProfile({
      id: localContext.profile.id,
      name: profileName
    });
    const context = { ...localContext, profile };
    setLocalContext(context);
    setProfileName(profile.name);
    await refreshLocalLists(context);
    setNotice(`Profile saved: ${profile.name}`);
  }, [localContext, profileName, refreshLocalLists]);

  const loadLocalProfile = useCallback(
    async (profileId: string) => {
      if (!window.radar) {
        setNotice("Run in Electron to load a profile.");
        return;
      }
      const context = await window.radar.loadLocalProfile(profileId);
      await applyLocalContext(context, `Profile loaded: ${context.profile.name}`);
    },
    [applyLocalContext]
  );

  const createLocalSession = useCallback(async (name?: string) => {
    if (!window.radar) {
      setNotice("Run in Electron to create a session.");
      return;
    }
    const context = await window.radar.createLocalSession(name);
    await applyLocalContext(context, `Session opened: ${context.session.name}`);
  }, [applyLocalContext]);

  const confirmNewSession = useCallback(async () => {
    await createLocalSession(newSessionName);
    setNewSessionOpen(false);
  }, [createLocalSession, newSessionName]);

  const saveLocalSession = useCallback(async () => {
    if (!window.radar || !localContext) {
      setNotice("Run in Electron to save a session.");
      return;
    }
    const session = await window.radar.saveLocalSession({
      id: localContext.session.id,
      name: sessionName
    });
    const context = { ...localContext, session };
    setLocalContext(context);
    setSessionName(session.name);
    await refreshLocalLists(context);
    setNotice(`Session saved: ${session.name}`);
  }, [localContext, refreshLocalLists, sessionName]);

  const loadLocalSession = useCallback(
    async (sessionId: string) => {
      if (!window.radar) {
        setNotice("Run in Electron to load a session.");
        return;
      }
      const context = await window.radar.loadLocalSession(sessionId);
      await applyLocalContext(context, `Session loaded: ${context.session.name}`);
    },
    [applyLocalContext]
  );

  const ensureProxyCa = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to create the proxy CA.");
      return;
    }
    const state = await window.radar.ensureProxyCa();
    setProxyState(state);
    setNotice("Proxy CA ready");
  }, []);

  const startProxy = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to start the proxy.");
      return;
    }
    const state = await window.radar.startProxy(proxyState.port);
    setProxyState(state);
    setNotice(`Proxy listening on ${state.proxyUrl}`);
  }, [proxyState.port]);

  const stopProxy = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    const state = await window.radar.stopProxy();
    setProxyState(state);
    setNotice("Proxy stopped");
  }, []);

  const activeAgentRun = agentRuns[0] || null;

  const setAppMode = useCallback(
    (mode: AppMode) => {
      setAppModeState(mode);
      window.localStorage.setItem("radar.appMode", mode);
      if (mode === "manual-first" && isActiveAgentRun(activeAgentRun)) {
        void window.radar?.stopAgentRun(activeAgentRun.id).then((run) => {
          if (run) {
            setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
          }
        });
      }
    },
    [activeAgentRun]
  );

  const startAgentRun = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to start an agent run.");
      return;
    }
    const goal = agentGoal.trim();
    if (!goal) {
      setNotice("Describe a goal before starting AI-First.");
      return;
    }
    const goalUrl = firstUrlFromText(goal);
    const startUrl = goalUrl || normalizeUrl(address);
    const scopeOrigin = goalUrl ? originFromUrl(goalUrl) : "";

    if (goalUrl && scopeOrigin) {
      const latestTargets = await window.radar.getTargets();
      if (!isAllowedTarget(goalUrl, latestTargets)) {
        const nextTargets = [...latestTargets, scopeOrigin];
        const saved = (await window.radar.setTargets(nextTargets)) || nextTargets;
        setTargets(saved);
        setTargetText(saved.join("\n"));
      }
    }

    const run = await window.radar.startAgentRun({
      goal,
      startUrl
    });
    setAddress(startUrl);
    setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    setAgentGoal("");
    setNotice(scopeOrigin ? `AI-First run started on ${scopeOrigin}` : "AI-First run started");
  }, [address, agentGoal]);

  const stopAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    const run = await window.radar.stopAgentRun(activeAgentRun.id);
    if (run) {
      setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    }
  }, [activeAgentRun]);

  useEffect(() => {
    if (appMode !== "ai-first" || !activeAgentRun) {
      agentUiCursorRef.current = null;
      return;
    }

    const cursor = agentUiCursorRef.current;
    const startIndex =
      cursor?.runId === activeAgentRun.id
        ? activeAgentRun.timeline.findIndex((entry) => entry.id === cursor.entryId)
        : -1;
    const nextEntries = activeAgentRun.timeline.slice(startIndex + 1);
    const lastEntry = nextEntries.at(-1);

    if (!lastEntry) {
      return;
    }

    for (const entry of nextEntries) {
      if (entry.toolCall?.tool === "showView") {
        setActiveView(entry.toolCall.input.view);
      }

      if (entry.toolCall?.tool === "sendReplay") {
        setDraft(entry.toolCall.input.draft);
        setHeadersText(formatHeaders(entry.toolCall.input.draft.headers));
        setLastBurst(null);
      }

      if (entry.toolResult?.tool === "sendReplay" && entry.toolResult.ok) {
        setLastResponse(entry.toolResult.data);
      }

      if (entry.toolResult?.tool === "getCaptures" && entry.toolResult.ok) {
        const firstCapture = entry.toolResult.data.captures.find((capture) => capture.allowed) || entry.toolResult.data.captures[0];
        if (firstCapture) {
          setSelectedId(firstCapture.id);
          setSelectedIds([firstCapture.id]);
          selectionAnchorRef.current = firstCapture.id;
        }
      }
    }

    agentUiCursorRef.current = { runId: activeAgentRun.id, entryId: lastEntry.id };
  }, [activeAgentRun, appMode]);

  const scopedTrafficCaptures = useMemo(
    () => captures.filter((capture) => isAllowedTarget(capture.url, targets)),
    [captures, targets]
  );

  const trafficMethods = useMemo(
    () => sortedMethods(Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.method).filter(Boolean)))),
    [scopedTrafficCaptures]
  );

  const trafficTypes = useMemo(
    () =>
      Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.type).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [scopedTrafficCaptures]
  );

  const trafficCaptures = useMemo(() => {
    const query = trafficSearch.trim().toLowerCase();
    const filtered = scopedTrafficCaptures.filter((capture) => {
      const methodMatches = trafficMethodFilter === "all" || capture.method === trafficMethodFilter;
      const typeMatches = trafficTypeFilter === "all" || capture.type === trafficTypeFilter;
      const searchMatches = !query || searchTextForCapture(capture).includes(query);
      return methodMatches && typeMatches && searchMatches;
    });
    return [...filtered].sort((left, right) =>
      compareTrafficCaptures(left, right, trafficSortField, trafficSortDirection)
    );
  }, [
    scopedTrafficCaptures,
    trafficMethodFilter,
    trafficSearch,
    trafficTypeFilter,
    trafficSortField,
    trafficSortDirection
  ]);

  const selected = useMemo(
    () => trafficCaptures.find((capture) => capture.id === selectedId) || trafficCaptures[0] || null,
    [trafficCaptures, selectedId]
  );

  const selectTrafficCapture = useCallback(
    (captureId: string, event?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
      const meta = Boolean(event?.metaKey || event?.ctrlKey);
      const shift = Boolean(event?.shiftKey);

      setSelectedId(captureId);

      setSelectedIds((current) => {
        if (shift && selectionAnchorRef.current) {
          const ids = trafficCaptures.map((capture) => capture.id);
          const start = ids.indexOf(selectionAnchorRef.current);
          const end = ids.indexOf(captureId);
          if (start === -1 || end === -1) {
            if (meta) {
              return current.includes(captureId)
                ? current.filter((id) => id !== captureId)
                : [...current, captureId];
            }
            selectionAnchorRef.current = captureId;
            return [captureId];
          }
          const from = Math.min(start, end);
          const to = Math.max(start, end);
          const range = ids.slice(from, to + 1);
          return meta ? [...new Set([...current, ...range])] : range;
        }
        if (meta) {
          return current.includes(captureId)
            ? current.filter((id) => id !== captureId)
            : [...current, captureId];
        }
        selectionAnchorRef.current = captureId;
        return [captureId];
      });
    },
    [trafficCaptures]
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(trafficCaptures.map((capture) => capture.id));
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [trafficCaptures]);

  const activeProfileId = localContext?.profile.id || "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar) {
        return;
      }
      const context = await window.radar.getLocalContext();
      const [items, nextProfiles, nextSessions, nextAgentRuns] = await Promise.all([
        window.radar.getTargets(),
        window.radar.listLocalProfiles(),
        window.radar.listLocalSessions(context.profile.id),
        window.radar.listAgentRuns()
      ]);
      if (cancelled) {
        return;
      }
      setLocalContext(context);
      setProfileName(context.profile.name);
      setSessionName(context.session.name);
      setTargets(items);
      setTargetText(items.join("\n"));
      setProfiles(nextProfiles);
      setSessions(nextSessions);
      setAgentRuns(nextAgentRuns);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProfileId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (!window.radar || cancelled) {
        return;
      }
      const [nextProfiles, nextSessions] = await Promise.all([
        window.radar.listLocalProfiles(),
        window.radar.listLocalSessions(activeProfileId)
      ]);
      if (!cancelled) {
        setProfiles(nextProfiles);
        setSessions(nextSessions);
      }
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProfileId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar || cancelled) {
        return;
      }
      const [nextCaptures, nextSslEvents, nextBrowserState, nextProxyState, nextAgentRuns] = await Promise.all([
        window.radar.getCaptures(),
        window.radar.getSslEvents(),
        window.radar.getBrowserState(),
        window.radar.getProxyState(),
        window.radar.listAgentRuns()
      ]);
      if (!cancelled) {
        setCaptures(nextCaptures);
        setSslEvents(nextSslEvents);
        setBrowserState(nextBrowserState);
        setProxyState(nextProxyState);
        setAgentRuns(nextAgentRuns);
      }
    };

    load();
    const timer = setInterval(load, 900);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAiPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const meta = viewMeta[activeView];
  const utc = clock.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const replayPending = sendReplayMutation.isPending || runBurstMutation.isPending;

  return {
    address,
    setAddress,
    captures,
    sslEvents,
    localContext,
    profiles,
    sessions,
    profileName,
    setProfileName,
    sessionName,
    setSessionName,
    profileSessionOpen,
    setProfileSessionOpen,
    newSessionOpen,
    setNewSessionOpen,
    newSessionName,
    setNewSessionName,
    browserState,
    proxyState,
    selectedId,
    setSelectedId,
    selectedIds,
    selectTrafficCapture,
    targets,
    targetText,
    setTargetText,
    scopedTrafficCaptures,
    trafficMethodFilter,
    setTrafficMethodFilter,
    trafficTypeFilter,
    setTrafficTypeFilter,
    trafficSearch,
    setTrafficSearch,
    trafficSortField,
    setTrafficSortField,
    trafficSortDirection,
    setTrafficSortDirection,
    trafficMethods,
    trafficTypes,
    draft,
    setDraft,
    headersText,
    setHeadersText,
    activeView,
    setActiveView,
    activeDetail,
    setActiveDetail,
    lastResponse,
    lastBurst,
    count,
    setCount,
    concurrency,
    setConcurrency,
    delayMs,
    setDelayMs,
    notice,
    setNotice,
    clock,
    appMode,
    setAppMode,
    agentGoal,
    setAgentGoal,
    agentRuns,
    activeAgentRun,
    startAgentRun,
    stopAgentRun,
    aiPaletteOpen,
    setAiPaletteOpen,
    ai,
    appearance,
    selected,
    trafficCaptures,
    meta,
    utc,
    openBrowser,
    saveTargets,
    addTarget,
    applyAiDraft,
    prepareAiNavigate,
    cloneToRepeater,
    sendReplay: sendReplayMutation.run,
    runBurst: runBurstMutation.run,
    sendReplayPending: sendReplayMutation.isPending,
    runBurstPending: runBurstMutation.isPending,
    replayPending,
    clearCaptures,
    deleteCapture,
    createLocalProfile,
    saveLocalProfile,
    loadLocalProfile,
    createLocalSession,
    openNewSessionDialog,
    confirmNewSession,
    saveLocalSession,
    loadLocalSession,
    ensureProxyCa,
    startProxy,
    stopProxy
  };
}
