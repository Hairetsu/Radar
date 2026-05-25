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
import { CommandPalette } from "./ai/CommandPalette";
import { useRadarWorkbench, viewMeta, WORK_VIEWS } from "./hooks/useRadarWorkbench";
import { bodyPreview, elapsed, formatHeaders, statusTone, tlsLine } from "./lib";

export function App() {
  const workbench = useRadarWorkbench();

  return (
    <main className="shell" data-testid="radarShell" data-component="radarShell">
      <div className="atmosphere" />

      <aside className="rail reveal delay-1">
        <span className="rail-mark">
          R<span>·</span>
        </span>
        <span className="rail-vertical">
          Radar <strong>// Bureau</strong> — Operational Surface Intelligence
        </span>
        <div className="rail-numerals">
          {WORK_VIEWS.map((view) => (
            <span key={view} className={workbench.activeView === view ? "live" : ""}>
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
          <span>Dossier No. R-{workbench.clock.getUTCFullYear()}-0481</span>
          <span className="dotline" />
          <span>{workbench.utc}</span>
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
              <span className="lat">40.7128°N // 74.0060°W</span>
            </div>
          </div>

          <form className="address" onSubmit={workbench.openBrowser} data-testid="addressForm" data-component="addressForm">
            <Globe2 size={15} strokeWidth={1.6} />
            <input
              value={workbench.address}
              onChange={(event) => workbench.setAddress(event.target.value)}
              spellCheck={false}
              placeholder="https://"
              data-testid="addressInput"
              data-component="addressInput"
            />
            <button type="submit" className="solid-button" data-testid="deployBrowser" data-component="deployBrowser">
              <ExternalLink size={14} strokeWidth={2} />
              Deploy
            </button>
            <button
              type="button"
              className="line-button"
              onClick={() => workbench.addTarget(workbench.address)}
              data-testid="markTarget"
              data-component="markTarget"
            >
              <Crosshair size={14} strokeWidth={1.7} />
              Mark
            </button>
          </form>

          <div className="status-rail">
            <span className={`status-pill ${workbench.browserState.open ? "live" : ""}`}>
              <span className="dot" />
              <CircleDot size={11} strokeWidth={1.8} />
              <strong>{workbench.browserState.open ? workbench.browserState.engine : "idle"}</strong>
            </span>
            <span className="status-pill cool">
              <Activity size={11} strokeWidth={1.8} />
              <strong>{workbench.captures.length}</strong> req
            </span>
            <span className="status-pill cool">
              <FileLock2 size={11} strokeWidth={1.8} />
              <strong>{workbench.sslEvents.length}</strong> tls
            </span>
            <span className={`status-pill ${workbench.proxyState.running ? "live" : ""}`}>
              <span className="dot" />
              <ShieldCheck size={11} strokeWidth={1.8} />
              <strong>{workbench.proxyState.running ? "proxy" : "off"}</strong>
            </span>
          </div>
        </header>

        <nav className="view-switch reveal delay-3" data-testid="viewSwitch" data-component="viewSwitch">
          {WORK_VIEWS.map((view) => (
            <button
              key={view}
              className={workbench.activeView === view ? "active" : ""}
              onClick={() => workbench.setActiveView(view)}
              data-testid={`view-${view}`}
              data-component="viewSwitchButton"
            >
              <span className="num">{viewMeta[view].num}</span>
              {viewMeta[view].label}
            </button>
          ))}
          <span className="telemetry">
            <span className="blip" />
            <span>
              {workbench.browserState.remoteDebuggingUrl ||
                workbench.browserState.url ||
                workbench.notice ||
                "Awaiting target acquisition"}
            </span>
          </span>
        </nav>

        <section className="workspace reveal delay-4">
          <div className="panel-head">
            <div className="head-left">
              <span className="display-num">
                {workbench.meta.num.replace(/(\d)$/, "")}
                <em>{workbench.meta.num.slice(-1)}</em>
              </span>
              <div>
                <span className="eyebrow">{workbench.meta.eyebrow}</span>
                <h2>{workbench.meta.title}</h2>
              </div>
            </div>
            <div className="head-right">
              <button
                className="line-button"
                type="button"
                onClick={() => workbench.setAiPaletteOpen(true)}
                title="Command palette (⌘K)"
                data-testid="openAiPalette"
                data-component="openAiPalette"
              >
                <Bot size={14} strokeWidth={1.7} />
                AI
              </button>
              {workbench.activeView === "traffic" && (
                <button
                  className="icon-button"
                  onClick={workbench.clearCaptures}
                  title="Clear log"
                  data-testid="clearCaptures"
                  data-component="clearCaptures"
                >
                  <Eraser size={15} strokeWidth={1.7} />
                </button>
              )}
              {workbench.activeView === "repeater" && (
                <button
                  className="line-button"
                  onClick={() => workbench.addTarget(workbench.draft.url)}
                  data-testid="trustOrigin"
                  data-component="trustOrigin"
                >
                  <Target size={14} strokeWidth={1.7} />
                  Trust Origin
                </button>
              )}
              {workbench.activeView === "scope" && (
                <button
                  className="solid-button compact"
                  onClick={() => workbench.saveTargets()}
                  data-testid="commitTargets"
                  data-component="commitTargets"
                >
                  Commit
                </button>
              )}
              {workbench.activeView === "ssl" && <span className="notice">{workbench.notice}</span>}
            </div>
          </div>

          {workbench.activeView === "traffic" && (
            <div className="traffic-grid">
              <div className="traffic-list">
                {workbench.captures.length === 0 && (
                  <div className="empty-state">
                    <Activity size={18} strokeWidth={1.4} />
                    <span>No transmissions intercepted</span>
                  </div>
                )}
                {workbench.captures.map((capture) => (
                  <button
                    key={capture.id}
                    className={`traffic-row ${capture.id === workbench.selected?.id ? "selected" : ""}`}
                    onClick={() => workbench.setSelectedId(capture.id)}
                    data-testid={`trafficRow-${capture.id}`}
                    data-component="trafficRow"
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
                    className={workbench.activeDetail === "request" ? "active" : ""}
                    onClick={() => workbench.setActiveDetail("request")}
                    data-testid="detailTabRequest"
                    data-component="detailTabRequest"
                  >
                    <Square size={9} strokeWidth={2} />
                    Request
                  </button>
                  <button
                    className={workbench.activeDetail === "response" ? "active" : ""}
                    onClick={() => workbench.setActiveDetail("response")}
                    data-testid="detailTabResponse"
                    data-component="detailTabResponse"
                  >
                    <Square size={9} strokeWidth={2} />
                    Response
                  </button>
                  <button
                    onClick={() => workbench.cloneToRepeater(workbench.selected)}
                    data-testid="cloneToRepeater"
                    data-component="cloneToRepeater"
                  >
                    <Repeat2 size={13} strokeWidth={1.7} />
                    To Repeater
                  </button>
                </div>
                <pre>
                  {workbench.selected
                    ? workbench.activeDetail === "request"
                      ? `${workbench.selected.method} ${workbench.selected.url}\n${tlsLine(workbench.selected)}\n\n${formatHeaders(
                          workbench.selected.requestHeaders
                        )}\n\n${bodyPreview(workbench.selected.requestBody)}`
                      : `${workbench.selected.status || ""} ${workbench.selected.statusText}\n${tlsLine(workbench.selected)}\n\n${formatHeaders(
                          workbench.selected.responseHeaders
                        )}\n\n${bodyPreview(workbench.selected.responseBody)}`
                    : ""}
                </pre>
              </div>
            </div>
          )}

          {workbench.activeView === "repeater" && (
            <div className="repeater-view">
              <div className="request-editor">
                <div className="repeater-grid">
                  <select
                    value={workbench.draft.method}
                    onChange={(event) => workbench.setDraft({ ...workbench.draft, method: event.target.value })}
                    data-testid="repeaterMethod"
                    data-component="repeaterMethod"
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                  <input
                    value={workbench.draft.url}
                    onChange={(event) => workbench.setDraft({ ...workbench.draft, url: event.target.value })}
                    spellCheck={false}
                    data-testid="repeaterUrl"
                    data-component="repeaterUrl"
                  />
                </div>

                <label className="field-label" htmlFor="headers">
                  Headers
                </label>
                <textarea
                  id="headers"
                  className="code-area headers-area"
                  value={workbench.headersText}
                  onChange={(event) => workbench.setHeadersText(event.target.value)}
                  spellCheck={false}
                  data-testid="repeaterHeaders"
                  data-component="repeaterHeaders"
                />

                <label className="field-label" htmlFor="body">
                  Body
                </label>
                <textarea
                  id="body"
                  className="code-area body-area"
                  value={workbench.draft.body}
                  onChange={(event) => workbench.setDraft({ ...workbench.draft, body: event.target.value })}
                  spellCheck={false}
                  data-testid="repeaterBody"
                  data-component="repeaterBody"
                />

                <div className="action-row">
                  <button
                    className="solid-button"
                    onClick={workbench.sendReplay}
                    disabled={workbench.replayPending}
                    data-testid="transmitReplay"
                    data-component="transmitReplay"
                  >
                    <Send size={14} strokeWidth={1.8} />
                    {workbench.sendReplayPending ? "Transmitting" : "Transmit"}
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
                      value={workbench.count}
                      onChange={(event) => workbench.setCount(Number(event.target.value))}
                      data-testid="burstCount"
                      data-component="burstCount"
                    />
                  </div>
                  <div className="burst-control">
                    <span>Parallel</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={workbench.concurrency}
                      onChange={(event) => workbench.setConcurrency(Number(event.target.value))}
                      data-testid="burstConcurrency"
                      data-component="burstConcurrency"
                    />
                  </div>
                  <div className="burst-control">
                    <span>Delay</span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={50}
                      value={workbench.delayMs}
                      onChange={(event) => workbench.setDelayMs(Number(event.target.value))}
                      data-testid="burstDelay"
                      data-component="burstDelay"
                    />
                  </div>
                  <button
                    className="zap-button"
                    onClick={workbench.runBurst}
                    disabled={workbench.replayPending}
                    data-testid="runBurst"
                    data-component="runBurst"
                  >
                    <Zap size={14} strokeWidth={1.8} />
                    {workbench.runBurstPending ? "Saturating" : "Saturate"}
                  </button>
                </div>

                <div className="response-well">
                  <div className="response-meta">
                    <span className={`status-dot ${statusTone(workbench.lastResponse?.status || null)}`} />
                    <strong>
                      {workbench.lastResponse
                        ? `${workbench.lastResponse.status} ${workbench.lastResponse.statusText}`
                        : "No response"}
                    </strong>
                    <span>{elapsed(workbench.lastResponse?.durationMs)}</span>
                    {workbench.lastBurst && <span>{workbench.lastBurst.failures} flagged</span>}
                  </div>
                  <pre>{workbench.lastResponse ? bodyPreview(workbench.lastResponse.body) : ""}</pre>
                </div>
              </div>
            </div>
          )}

          {workbench.activeView === "scope" && (
            <div className="scope-view">
              <textarea
                className="target-list"
                value={workbench.targetText}
                onChange={(event) => workbench.setTargetText(event.target.value)}
                spellCheck={false}
                placeholder="https://your-target.example"
                data-testid="scopeTargetList"
                data-component="scopeTargetList"
              />
              <button
                type="button"
                className="agent-rack"
                onClick={() => workbench.setAiPaletteOpen(true)}
                data-testid="scopeOpenAiPalette"
                data-component="scopeOpenAiPalette"
              >
                <Bot size={15} strokeWidth={1.7} />
                <span>AI command palette — ⌘K</span>
              </button>
            </div>
          )}

          {workbench.activeView === "ssl" && (
            <div className="ssl-view">
              <div className="ssl-summary">
                <LockKeyhole size={20} strokeWidth={1.6} />
                <strong>{workbench.proxyState.running ? workbench.proxyState.proxyUrl : "proxy stopped"}</strong>
                <span>CA: {workbench.proxyState.caCertPath || "not generated"}</span>
                <span>Profile: {workbench.browserState.profileDir || "opens on demand"}</span>
              </div>

              <div className="proxy-card">
                <div className="proxy-actions">
                  <button
                    className="solid-button"
                    onClick={workbench.startProxy}
                    data-testid="startProxy"
                    data-component="startProxy"
                  >
                    <Play size={14} strokeWidth={1.8} />
                    Engage Proxy
                  </button>
                  <button
                    className="line-button"
                    onClick={workbench.stopProxy}
                    data-testid="stopProxy"
                    data-component="stopProxy"
                  >
                    Disengage
                  </button>
                  <button
                    className="line-button"
                    onClick={workbench.ensureProxyCa}
                    data-testid="forgeCa"
                    data-component="forgeCa"
                  >
                    <LockKeyhole size={13} strokeWidth={1.7} />
                    Forge CA
                  </button>
                </div>
                <div className="proxy-lines">
                  <span>HTTP proxy: {workbench.proxyState.proxyUrl}</span>
                  <span>CA cert: {workbench.proxyState.caCertPath || "—"}</span>
                  <span>SPKI: {workbench.proxyState.caFingerprint || "—"}</span>
                  <span>Chrome CDP: {workbench.browserState.remoteDebuggingUrl || "launch browser from Deploy"}</span>
                  <span>Browser: {workbench.browserState.channel || "not launched"}</span>
                  <span>Binary: {workbench.browserState.executablePath || "—"}</span>
                </div>
              </div>

              <div className="ssl-events">
                {workbench.sslEvents.length === 0 && <div className="empty-state">No certificate events</div>}
                {workbench.sslEvents.map((event) => (
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
              <pre>
                {workbench.selected
                  ? `${workbench.selected.url}\n${tlsLine(workbench.selected)}`
                  : ""}
              </pre>
            </div>
          )}
        </section>
      </section>

      <CommandPalette
        open={workbench.aiPaletteOpen}
        onClose={() => workbench.setAiPaletteOpen(false)}
        captureIds={workbench.selected ? [workbench.selected.id] : []}
        captures={workbench.captures}
        targets={workbench.targets}
        browserUrl={workbench.browserState.url || workbench.address}
        onApplyDraft={workbench.applyAiDraft}
        onPrepareNavigate={workbench.prepareAiNavigate}
        onNotice={workbench.setNotice}
      />

      <footer className="ticker reveal delay-5">
        <div className="left">
          <span className="item signal">
            <span className="blip" />
            Radar Online
          </span>
          <span className="item">
            UTC <em>{workbench.utc}</em>
          </span>
          <span className="item">
            Sector <em>03</em>
          </span>
        </div>
        <div className="right">
          <span className="item">
            View <em>{workbench.meta.num}</em> · {workbench.meta.label}
          </span>
          <span className="item">
            Captures <em>{workbench.captures.length}</em>
          </span>
          <span className="item">
            TLS <em>{workbench.sslEvents.length}</em>
          </span>
          <span className="item">
            Proxy <em>{workbench.proxyState.running ? "engaged" : "standby"}</em>
          </span>
        </div>
      </footer>
    </main>
  );
}
