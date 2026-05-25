import {
  Activity,
  Bot,
  CircleDot,
  Crosshair,
  Eraser,
  ExternalLink,
  FileLock2,
  Globe2,
  LockKeyhole,
  Play,
  Radar as RadarIcon,
  Repeat2,
  Send,
  ShieldCheck,
  Square,
  Target,
  Zap
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  BrowserState,
  BurstResult,
  CapturedRequest,
  ProxyState,
  ReplayDraft,
  ReplayResult,
  SslEvent
} from "./types";

type WorkView = "traffic" | "repeater" | "scope" | "ssl";

const defaultUrl = "http://localhost:3000";
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

const viewMeta: Record<WorkView, { num: string; label: string; eyebrow: string; title: string }> = {
  traffic: { num: "01", label: "Traffic", eyebrow: "Capture // Live wire", title: "Traffic" },
  repeater: { num: "02", label: "Repeater", eyebrow: "Replay // Surface probe", title: "Repeater" },
  scope: { num: "03", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "04", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultUrl;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function originFromUrl(value: string) {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
}

function formatHeaders(headers: Record<string, string>) {
  return JSON.stringify(headers, null, 2);
}

function parseHeaders(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)]));
}

function statusTone(status: number | null) {
  if (!status) {
    return "ghost";
  }
  if (status >= 500) {
    return "danger";
  }
  if (status >= 400) {
    return "warn";
  }
  if (status >= 300) {
    return "move";
  }
  return "good";
}

function elapsed(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "—";
}

function bodyPreview(value: string) {
  if (!value) {
    return "";
  }
  return value.length > 5000 ? `${value.slice(0, 5000)}\n\n[preview truncated]` : value;
}

function tlsLine(capture: CapturedRequest | null) {
  if (!capture?.tls) {
    return "TLS: none";
  }
  return `TLS: ${capture.tls.protocol || "unknown"} | ${capture.tls.subjectName || "unknown subject"} | ${
    capture.tls.issuer || "unknown issuer"
  }`;
}

export function App() {
  const [address, setAddress] = useState(defaultUrl);
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [sslEvents, setSslEvents] = useState<SslEvent[]>([]);
  const [browserState, setBrowserState] = useState<BrowserState>(defaultBrowserState);
  const [proxyState, setProxyState] = useState<ProxyState>(defaultProxyState);
  const [selectedId, setSelectedId] = useState<string>("");
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
  const [busy, setBusy] = useState<"send" | "burst" | "">("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => new Date());

  const selected = useMemo(
    () => captures.find((capture) => capture.id === selectedId) || captures[0] || null,
    [captures, selectedId]
  );

  const meta = viewMeta[activeView];

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

  async function openBrowser(event?: FormEvent) {
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
      setNotice("Chrome launched through Radar proxy");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chrome launch failed");
    }
  }

  async function saveTargets(nextText = targetText) {
    const next = nextText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const saved = (await window.radar?.setTargets(next)) || next;
    setTargets(saved);
    setTargetText(saved.join("\n"));
    setNotice("Targets saved");
  }

  async function addTarget(value: string) {
    const origin = originFromUrl(value);
    if (!origin || targets.includes(origin)) {
      return;
    }
    const next = [...targets, origin];
    const saved = (await window.radar?.setTargets(next)) || next;
    setTargets(saved);
    setTargetText(saved.join("\n"));
    setNotice(`Added ${origin}`);
  }

  function cloneToRepeater(capture: CapturedRequest | null) {
    if (!capture) {
      return;
    }
    const nextDraft = {
      method: capture.method,
      url: capture.url,
      headers: capture.requestHeaders,
      body: capture.requestBody || ""
    };
    setDraft(nextDraft);
    setHeadersText(formatHeaders(nextDraft.headers));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded in repeater");
  }

  async function sendReplay() {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setBusy("send");
      setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const response = await window.radar.sendReplay(request);
      setLastResponse(response);
      setLastBurst(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Replay failed");
    } finally {
      setBusy("");
    }
  }

  async function runBurst() {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setBusy("burst");
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
    } finally {
      setBusy("");
    }
  }

  async function clearCaptures() {
    await window.radar?.clearCaptures();
    setCaptures([]);
    setSelectedId("");
  }

  async function ensureProxyCa() {
    if (!window.radar) {
      setNotice("Run in Electron to create the proxy CA.");
      return;
    }
    const state = await window.radar.ensureProxyCa();
    setProxyState(state);
    setNotice("Proxy CA ready");
  }

  async function startProxy() {
    if (!window.radar) {
      setNotice("Run in Electron to start the proxy.");
      return;
    }
    const state = await window.radar.startProxy(proxyState.port);
    setProxyState(state);
    setNotice(`Proxy listening on ${state.proxyUrl}`);
  }

  async function stopProxy() {
    if (!window.radar) {
      return;
    }
    const state = await window.radar.stopProxy();
    setProxyState(state);
    setNotice("Proxy stopped");
  }

  const utc = clock.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const lat = "40.7128°N // 74.0060°W";

  return (
    <main className="shell">
      <div className="atmosphere" />

      <aside className="rail reveal delay-1">
        <span className="rail-mark">
          R<span>·</span>
        </span>
        <span className="rail-vertical">
          Radar <strong>// Bureau</strong> — Operational Surface Intelligence
        </span>
        <div className="rail-numerals">
          {(["traffic", "repeater", "scope", "ssl"] as WorkView[]).map((view) => (
            <span key={view} className={activeView === view ? "live" : ""}>
              {viewMeta[view].num}
            </span>
          ))}
        </div>
      </aside>

      <section className="main">
        <div className="classification reveal delay-1">
          <span>
            <em>Confidential</em> // Operational
          </span>
          <span className="dotline" />
          <span>Dossier No. R-{clock.getUTCFullYear()}-0481</span>
          <span className="dotline" />
          <span>{utc}</span>
        </div>

        <header className="topbar reveal delay-2">
          <div className="brand">
            <span className="brand-mark">
              <RadarIcon size={22} strokeWidth={1.6} />
            </span>
            <h1>
              Rad<span className="accent">a</span>r
            </h1>
            <div className="brand-meta">
              <span className="tag">
                <em>Field</em> — Attack Surface Workbench
              </span>
              <span className="lat">{lat}</span>
            </div>
          </div>

          <form className="address" onSubmit={openBrowser}>
            <Globe2 size={15} strokeWidth={1.6} />
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
              placeholder="https://"
            />
            <button type="submit" className="solid-button">
              <ExternalLink size={14} strokeWidth={2} />
              Deploy
            </button>
            <button type="button" className="line-button" onClick={() => addTarget(address)}>
              <Crosshair size={14} strokeWidth={1.7} />
              Mark
            </button>
          </form>

          <div className="status-rail">
            <span className={`status-pill ${browserState.open ? "live" : ""}`}>
              <span className="dot" />
              <CircleDot size={11} strokeWidth={1.8} />
              <strong>{browserState.open ? browserState.engine : "idle"}</strong>
            </span>
            <span className="status-pill cool">
              <Activity size={11} strokeWidth={1.8} />
              <strong>{captures.length}</strong> req
            </span>
            <span className="status-pill cool">
              <FileLock2 size={11} strokeWidth={1.8} />
              <strong>{sslEvents.length}</strong> tls
            </span>
            <span className={`status-pill ${proxyState.running ? "live" : ""}`}>
              <span className="dot" />
              <ShieldCheck size={11} strokeWidth={1.8} />
              <strong>{proxyState.running ? "proxy" : "off"}</strong>
            </span>
          </div>
        </header>

        <nav className="view-switch reveal delay-3">
          {(["traffic", "repeater", "scope", "ssl"] as WorkView[]).map((view) => (
            <button
              key={view}
              className={activeView === view ? "active" : ""}
              onClick={() => setActiveView(view)}
            >
              <span className="num">{viewMeta[view].num}</span>
              {viewMeta[view].label}
            </button>
          ))}
          <span className="telemetry">
            <span className="blip" />
            <span>{browserState.remoteDebuggingUrl || browserState.url || notice || "Awaiting target acquisition"}</span>
          </span>
        </nav>

        <section className="workspace reveal delay-4">
          <div className="panel-head">
            <div className="head-left">
              <span className="display-num">
                {meta.num.replace(/(\d)$/, "")}
                <em>{meta.num.slice(-1)}</em>
              </span>
              <div>
                <span className="eyebrow">{meta.eyebrow}</span>
                <h2>{meta.title}</h2>
              </div>
            </div>
            <div className="head-right">
              {activeView === "traffic" && (
                <button className="icon-button" onClick={clearCaptures} title="Clear log">
                  <Eraser size={15} strokeWidth={1.7} />
                </button>
              )}
              {activeView === "repeater" && (
                <button className="line-button" onClick={() => addTarget(draft.url)}>
                  <Target size={14} strokeWidth={1.7} />
                  Trust Origin
                </button>
              )}
              {activeView === "scope" && (
                <button className="solid-button compact" onClick={() => saveTargets()}>
                  Commit
                </button>
              )}
              {activeView === "ssl" && <span className="notice">{notice}</span>}
            </div>
          </div>

          {activeView === "traffic" && (
            <div className="traffic-grid">
              <div className="traffic-list">
                {captures.length === 0 && (
                  <div className="empty-state">
                    <Activity size={18} strokeWidth={1.4} />
                    <span>No transmissions intercepted</span>
                  </div>
                )}
                {captures.map((capture) => (
                  <button
                    key={capture.id}
                    className={`traffic-row ${capture.id === selected?.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(capture.id)}
                  >
                    <span className="method">{capture.method}</span>
                    <span className={`status ${statusTone(capture.status)}`}>{capture.status || "···"}</span>
                    <span className="host">{capture.host}</span>
                    <span className="path">{capture.path}</span>
                    <span className="type">{capture.tls ? capture.tls.protocol : capture.type}</span>
                    <span className="time">{elapsed(capture.durationMs)}</span>
                  </button>
                ))}
              </div>

              <div className="detail-pane">
                <div className="detail-tabs">
                  <button
                    className={activeDetail === "request" ? "active" : ""}
                    onClick={() => setActiveDetail("request")}
                  >
                    <Square size={9} strokeWidth={2} />
                    Request
                  </button>
                  <button
                    className={activeDetail === "response" ? "active" : ""}
                    onClick={() => setActiveDetail("response")}
                  >
                    <Square size={9} strokeWidth={2} />
                    Response
                  </button>
                  <button onClick={() => cloneToRepeater(selected)}>
                    <Repeat2 size={13} strokeWidth={1.7} />
                    To Repeater
                  </button>
                </div>
                <pre>
                  {selected
                    ? activeDetail === "request"
                      ? `${selected.method} ${selected.url}\n${tlsLine(selected)}\n\n${formatHeaders(
                          selected.requestHeaders
                        )}\n\n${bodyPreview(selected.requestBody)}`
                      : `${selected.status || ""} ${selected.statusText}\n${tlsLine(selected)}\n\n${formatHeaders(
                          selected.responseHeaders
                        )}\n\n${bodyPreview(selected.responseBody)}`
                    : ""}
                </pre>
              </div>
            </div>
          )}

          {activeView === "repeater" && (
            <div className="repeater-view">
              <div className="request-editor">
                <div className="repeater-grid">
                  <select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                  <input
                    value={draft.url}
                    onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                    spellCheck={false}
                  />
                </div>

                <label className="field-label" htmlFor="headers">
                  Headers
                </label>
                <textarea
                  id="headers"
                  className="code-area headers-area"
                  value={headersText}
                  onChange={(event) => setHeadersText(event.target.value)}
                  spellCheck={false}
                />

                <label className="field-label" htmlFor="body">
                  Body
                </label>
                <textarea
                  id="body"
                  className="code-area body-area"
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  spellCheck={false}
                />

                <div className="action-row">
                  <button className="solid-button" onClick={sendReplay} disabled={busy !== ""}>
                    <Send size={14} strokeWidth={1.8} />
                    {busy === "send" ? "Transmitting" : "Transmit"}
                  </button>
                </div>
              </div>

              <div className="repeat-results">
                <div className="burst-box">
                  <div className="burst-control">
                    <span>Count</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    />
                  </div>
                  <div className="burst-control">
                    <span>Parallel</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={concurrency}
                      onChange={(event) => setConcurrency(Number(event.target.value))}
                    />
                  </div>
                  <div className="burst-control">
                    <span>Delay</span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={50}
                      value={delayMs}
                      onChange={(event) => setDelayMs(Number(event.target.value))}
                    />
                  </div>
                  <button className="zap-button" onClick={runBurst} disabled={busy !== ""}>
                    <Zap size={14} strokeWidth={1.8} />
                    {busy === "burst" ? "Saturating" : "Saturate"}
                  </button>
                </div>

                <div className="response-well">
                  <div className="response-meta">
                    <span className={`status-dot ${statusTone(lastResponse?.status || null)}`} />
                    <strong>
                      {lastResponse ? `${lastResponse.status} ${lastResponse.statusText}` : "No response"}
                    </strong>
                    <span>{elapsed(lastResponse?.durationMs)}</span>
                    {lastBurst && <span>{lastBurst.failures} flagged</span>}
                  </div>
                  <pre>{lastResponse ? bodyPreview(lastResponse.body) : ""}</pre>
                </div>
              </div>
            </div>
          )}

          {activeView === "scope" && (
            <div className="scope-view">
              <textarea
                className="target-list"
                value={targetText}
                onChange={(event) => setTargetText(event.target.value)}
                spellCheck={false}
                placeholder="https://your-target.example"
              />
              <div className="agent-rack">
                <Bot size={15} strokeWidth={1.7} />
                <span>Agent dock — reserved channel</span>
              </div>
            </div>
          )}

          {activeView === "ssl" && (
            <div className="ssl-view">
              <div className="ssl-summary">
                <LockKeyhole size={20} strokeWidth={1.6} />
                <strong>{proxyState.running ? proxyState.proxyUrl : "proxy stopped"}</strong>
                <span>CA: {proxyState.caCertPath || "not generated"}</span>
                <span>Profile: {browserState.profileDir || "opens on demand"}</span>
              </div>

              <div className="proxy-card">
                <div className="proxy-actions">
                  <button className="solid-button" onClick={startProxy}>
                    <Play size={14} strokeWidth={1.8} />
                    Engage Proxy
                  </button>
                  <button className="line-button" onClick={stopProxy}>
                    Disengage
                  </button>
                  <button className="line-button" onClick={ensureProxyCa}>
                    <LockKeyhole size={13} strokeWidth={1.7} />
                    Forge CA
                  </button>
                </div>
                <div className="proxy-lines">
                  <span>HTTP proxy: {proxyState.proxyUrl}</span>
                  <span>CA cert: {proxyState.caCertPath || "—"}</span>
                  <span>SPKI: {proxyState.caFingerprint || "—"}</span>
                  <span>Chrome CDP: {browserState.remoteDebuggingUrl || "launch Chrome from Radar"}</span>
                  <span>Browser: {browserState.channel || "Radar-managed Chromium"}</span>
                  <span>Build: {browserState.buildId || "installs on first launch"}</span>
                </div>
              </div>

              <div className="ssl-events">
                {sslEvents.length === 0 && <div className="empty-state">No certificate events</div>}
                {sslEvents.map((event) => (
                  <div key={event.id} className="ssl-event">
                    <span className={event.trusted ? "good-text" : "danger-text"}>
                      {event.trusted ? "TRUSTED" : "BLOCKED"}
                    </span>
                    <strong>{event.error}</strong>
                    <span>{event.url}</span>
                    <small>{event.subjectName || event.issuerName || event.createdAt}</small>
                  </div>
                ))}
              </div>
              <pre>{selected ? `${selected.url}\n${tlsLine(selected)}` : ""}</pre>
            </div>
          )}
        </section>
      </section>

      <footer className="ticker reveal delay-5">
        <div className="left">
          <span className="item signal">
            <span className="blip" />
            Radar Online
          </span>
          <span className="item">
            UTC <em>{utc}</em>
          </span>
          <span className="item">
            Sector <em>03</em>
          </span>
        </div>
        <div className="right">
          <span className="item">
            View <em>{meta.num}</em> · {meta.label}
          </span>
          <span className="item">
            Captures <em>{captures.length}</em>
          </span>
          <span className="item">
            TLS <em>{sslEvents.length}</em>
          </span>
          <span className="item">
            Proxy <em>{proxyState.running ? "engaged" : "standby"}</em>
          </span>
        </div>
      </footer>
    </main>
  );
}
