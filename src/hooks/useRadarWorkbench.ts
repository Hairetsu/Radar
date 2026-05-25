import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_URL as defaultUrl, formatHeaders, normalizeUrl, originFromUrl, parseHeaders } from "../lib";
import type {
  BrowserState,
  BurstResult,
  CapturedRequest,
  ProxyState,
  ReplayDraft,
  ReplayResult,
  SslEvent
} from "../types";
import { useAsyncAction } from "./useAsyncAction";

export type WorkView = "traffic" | "repeater" | "scope" | "ssl";

export const WORK_VIEWS: WorkView[] = ["traffic", "repeater", "scope", "ssl"];

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

export const viewMeta: Record<WorkView, { num: string; label: string; eyebrow: string; title: string }> = {
  traffic: { num: "01", label: "Traffic", eyebrow: "Capture // Live wire", title: "Traffic" },
  repeater: { num: "02", label: "Repeater", eyebrow: "Replay // Surface probe", title: "Repeater" },
  scope: { num: "03", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "04", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
};

export function useRadarWorkbench() {
  const [address, setAddress] = useState(defaultUrl);
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [sslEvents, setSslEvents] = useState<SslEvent[]>([]);
  const [browserState, setBrowserState] = useState<BrowserState>(defaultBrowserState);
  const [proxyState, setProxyState] = useState<ProxyState>(defaultProxyState);
  const [selectedId, setSelectedId] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [targetText, setTargetText] = useState("");
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
      if (!origin || targets.includes(origin)) {
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
  }, []);

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

  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) || captures[0] || null,
    [captures, selectedId]
  );

  useEffect(() => {
    window.radar?.getTargets().then((items) => {
      setTargets(items);
      setTargetText(items.join("\n"));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar || cancelled) {
        return;
      }
      const [nextCaptures, nextSslEvents, nextBrowserState, nextProxyState] = await Promise.all([
        window.radar.getCaptures(),
        window.radar.getSslEvents(),
        window.radar.getBrowserState(),
        window.radar.getProxyState()
      ]);
      if (!cancelled) {
        setCaptures(nextCaptures);
        setSslEvents(nextSslEvents);
        setBrowserState(nextBrowserState);
        setProxyState(nextProxyState);
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
    browserState,
    proxyState,
    selectedId,
    setSelectedId,
    targets,
    targetText,
    setTargetText,
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
    aiPaletteOpen,
    setAiPaletteOpen,
    selected,
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
    ensureProxyCa,
    startProxy,
    stopProxy
  };
}
