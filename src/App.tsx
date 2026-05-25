import {
  Activity,
  Bot,
  CircleDot,
  Crosshair,
  Eraser,
  ExternalLink,
  FileLock2,
  FilePlus2,
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
import { EmptyState, FieldLabel, StatusBadge, StatusDot, StatusPill, ToneText } from "./components/radar/primitives";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { useRadarWorkbench, viewMeta, WORK_VIEWS } from "./hooks/useRadarWorkbench";
import { bodyPreview, cn, elapsed, formatHeaders, statusTone, tlsLine } from "./lib";

const shellClass =
  "radar-shell relative grid h-full min-h-full cursor-default overflow-hidden [grid-template-columns:56px_minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)_28px] max-[1180px]:[grid-template-columns:1fr] max-[1180px]:[grid-template-rows:auto_minmax(0,1fr)_28px]";

const revealClass = "opacity-0 animate-[enter_720ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]";

const monoMuted = "font-mono text-[11px] text-muted";

const ellipsisMono = cn(monoMuted, "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap");

const viewButtonClass = (active: boolean) =>
  cn(
    "relative inline-flex shrink-0 items-center gap-2.5 border-0 border-r border-rule bg-transparent px-5 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted transition [font-stretch:75%]",
    "hover:bg-signal/5 hover:text-bone hover:[&_.num]:text-signal",
    active &&
      "bg-signal/[0.06] text-bone after:absolute after:-bottom-px after:-left-px after:-right-px after:h-0.5 after:bg-signal after:shadow-[0_0_14px_rgba(255,87,51,0.6)] after:content-[''] [&_.num]:text-signal"
  );

const detailTabClass = (active: boolean) =>
  cn(
    "inline-flex h-[38px] items-center gap-2 border-0 border-r border-rule bg-transparent px-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted transition",
    "hover:bg-signal/5 hover:text-bone",
    active && "-mb-px border-b border-signal bg-signal/10 text-signal"
  );

const trafficRowClass = (selected: boolean) =>
  cn(
    "relative grid h-[46px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-4 py-2.5 text-left text-copy transition",
    "justify-stretch normal-case",
    "[grid-template-columns:64px_60px_minmax(120px,0.9fr)_minmax(180px,1.5fr)_90px_60px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-signal before:transition-all before:content-['']",
    "hover:bg-signal/5 hover:text-bone hover:before:w-[3px]",
    selected && "bg-signal/[0.08] text-bone before:w-[3px]"
  );

export function App() {
  const workbench = useRadarWorkbench();

  return (
    <main className={shellClass} data-testid="radarShell" data-component="radarShell">
      <div
        className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] [inset:-10vmax]"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 12% 12%, rgba(255, 87, 51, 0.1), transparent 70%), radial-gradient(ellipse 30% 25% at 88% 90%, rgba(107, 138, 166, 0.07), transparent 70%)"
        }}
      />

      <aside
        className={cn(
          revealClass,
          "relative z-[3] flex flex-col items-center justify-between border-r border-rule/80 bg-ink/60 py-4 [animation-delay:60ms] max-[1180px]:hidden",
          "[grid-column:1/2] [grid-row:1/2]",
          "bg-[linear-gradient(180deg,rgba(255,87,51,0.04),transparent_30%),repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgba(237,229,210,0.012)_10px,rgba(237,229,210,0.012)_11px)]"
        )}
      >
        <span className="font-display text-[22px] font-bold tracking-[0.04em] text-bone [font-stretch:75%]">
          R<span className="text-signal">·</span>
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.42em] text-muted [writing-mode:vertical-rl] [transform:rotate(180deg)]">
          Radar <strong>// Bureau</strong> — Operational Surface Intelligence
        </span>
        <div className="flex flex-col items-center gap-3 font-mono text-[9px] tracking-[0.18em] text-muted">
          {WORK_VIEWS.map((view) => (
            <span
              key={view}
              className={cn(
                "flex h-7 w-7 items-center justify-center border border-rule/80 transition",
                workbench.activeView === view && "border-signal/60 bg-signal/10 text-signal"
              )}
            >
              {viewMeta[view].num}
            </span>
          ))}
        </div>
      </aside>

      <section className="relative z-[2] flex min-h-0 min-w-0 flex-col overflow-hidden px-[18px] py-3.5 [grid-column:2/3] [grid-row:1/2] max-[1180px]:[grid-column:1/2] max-[1180px]:[grid-row:1/2] max-[640px]:px-4">
        <div
          className={cn(
            revealClass,
            "flex items-center justify-between border-b border-dashed border-bone/[0.08] px-0.5 pb-2.5 font-mono text-[9.5px] uppercase tracking-[0.5em] text-muted [animation-delay:60ms]",
            "max-[640px]:grid max-[640px]:grid-cols-2 max-[640px]:gap-y-1 max-[640px]:text-[8.5px] max-[640px]:tracking-[0.28em]"
          )}
        >
          <span>
            <em className="not-italic font-bold tracking-[0.4em] text-signal">Confidential</em> // Operational
          </span>
          <span className="mx-4 h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(237,229,210,0.18)_0_4px,transparent_4px_10px)] max-[640px]:hidden" />
          <span>
            {workbench.localContext
              ? `${workbench.localContext.workspace.name} // ${workbench.localContext.session.name}`
              : `Dossier No. R-${workbench.clock.getUTCFullYear()}-0481`}
          </span>
          <span className="mx-4 h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(237,229,210,0.18)_0_4px,transparent_4px_10px)] max-[640px]:hidden" />
          <span>{workbench.utc}</span>
        </div>

        <header
          className={cn(
            revealClass,
            "relative grid items-end gap-4 pb-3 pt-4 [animation-delay:140ms] [grid-template-columns:minmax(0,auto)_minmax(380px,1fr)_auto] max-[1180px]:grid-cols-1"
          )}
        >
          <div className="flex min-w-0 items-end gap-3 max-[640px]:items-center">
            <span
              className={cn(
                "relative grid h-[58px] w-[58px] shrink-0 place-items-center border border-rule text-signal max-[640px]:h-12 max-[640px]:w-12",
                "bg-[radial-gradient(circle_at_center,rgba(255,87,51,0.18),transparent_70%),linear-gradient(180deg,rgba(26,29,36,0.9),rgba(10,11,14,0.9))]",
                "before:pointer-events-none before:absolute before:inset-2 before:animate-[ping_3.2s_cubic-bezier(0.2,0.6,0.2,1)_infinite] before:rounded-full before:border before:border-signal/50 before:content-['']",
                "after:pointer-events-none after:absolute after:inset-4 after:animate-[ping_3.2s_cubic-bezier(0.2,0.6,0.2,1)_infinite] after:rounded-full after:border after:border-signal/50 after:[animation-delay:1.6s] after:content-['']"
              )}
            >
              <RadarIcon size={22} strokeWidth={1.6} />
            </span>
            <h1 className="font-display text-[clamp(38px,4.4vw,60px)] font-semibold uppercase leading-[0.78] tracking-[0] text-bone [font-stretch:75%] max-[640px]:text-[38px]">
              Rad<span className="font-bold italic text-signal">a</span>r
            </h1>
            <div className="flex min-w-0 flex-col gap-0.5 pb-1">
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.36em] text-muted max-[640px]:text-[8.5px] max-[640px]:tracking-[0.22em]">
                <em className="not-italic font-semibold text-bone">{workbench.localContext?.profile.name || "Field"}</em> — Attack Surface Workbench
              </span>
              <span className="font-mono text-[9.5px] tracking-[0.18em] text-dim max-[640px]:hidden">
                40.7128°N // 74.0060°W
              </span>
            </div>
          </div>

          <form
            className={cn(
              "relative grid h-[46px] items-center border border-rule pr-1.5 [grid-template-columns:28px_minmax(0,1fr)_auto_auto]",
              "max-[640px]:h-auto max-[640px]:gap-y-2 max-[640px]:pb-2 max-[640px]:pr-0 max-[640px]:[grid-template-columns:28px_minmax(0,1fr)]",
              "bg-[linear-gradient(180deg,rgba(26,29,36,0.9),rgba(10,11,14,0.85))]",
              "before:absolute before:-top-2 before:left-2 before:bg-ink before:px-[5px] before:font-mono before:text-[8.5px] before:tracking-[0.3em] before:text-signal before:content-['OP-1']"
            )}
            onSubmit={workbench.openBrowser}
            data-testid="addressForm"
            data-component="addressForm"
          >
            <Globe2 className="justify-self-center text-signal" size={15} strokeWidth={1.6} />
            <Input
              variant="address"
              value={workbench.address}
              onChange={(event) => workbench.setAddress(event.target.value)}
              spellCheck={false}
              placeholder="https://"
              data-testid="addressInput"
              data-component="addressInput"
            />
            <Button
              type="submit"
              variant="solid"
              className="max-[640px]:col-span-2 max-[640px]:mx-2"
              data-testid="deployBrowser"
              data-component="deployBrowser"
            >
              <ExternalLink size={14} strokeWidth={2} />
              Deploy
            </Button>
            <Button
              type="button"
              variant="outline"
              className="max-[640px]:col-span-2 max-[640px]:mx-2"
              onClick={() => workbench.addTarget(workbench.address)}
              data-testid="markTarget"
              data-component="markTarget"
            >
              <Crosshair size={14} strokeWidth={1.7} />
              Mark
            </Button>
          </form>

          <div className="flex flex-wrap items-stretch gap-1.5">
            <StatusPill live={workbench.browserState.open}>
              <CircleDot size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-[0.05em] text-bone">
                {workbench.browserState.open ? workbench.browserState.engine : "idle"}
              </strong>
            </StatusPill>
            <StatusPill cool>
              <Activity size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-[0.05em] text-bone">{workbench.captures.length}</strong> req
            </StatusPill>
            <StatusPill cool>
              <FileLock2 size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-[0.05em] text-bone">{workbench.sslEvents.length}</strong> tls
            </StatusPill>
            <StatusPill live={workbench.proxyState.running}>
              <ShieldCheck size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-[0.05em] text-bone">
                {workbench.proxyState.running ? "proxy" : "off"}
              </strong>
            </StatusPill>
          </div>
        </header>

        <nav
          className={cn(
            revealClass,
            "relative mt-4 flex h-[46px] items-stretch overflow-x-auto overflow-y-hidden border-y border-rule [animation-delay:220ms]",
            "before:pointer-events-none before:absolute before:inset-0 before:bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(237,229,210,0.018)_6px_7px)] before:content-['']"
          )}
          data-testid="viewSwitch"
          data-component="viewSwitch"
        >
          {WORK_VIEWS.map((view) => (
            <Button
              key={view}
              variant="ghost"
              className={viewButtonClass(workbench.activeView === view)}
              onClick={() => workbench.setActiveView(view)}
              data-testid={`view-${view}`}
              data-component="viewSwitchButton"
            >
              <span className="num font-mono text-[9.5px] font-medium tracking-[0.18em] text-dim">
                {viewMeta[view].num}
              </span>
              {viewMeta[view].label}
            </Button>
          ))}
          <span className="ml-auto inline-flex min-w-0 items-center gap-3 px-4 font-mono text-[10px] tracking-[0.16em] text-muted max-[640px]:hidden">
            <span className="h-1.5 w-1.5 animate-[pulse_1.6s_ease-in-out_infinite] rounded-full bg-signal" />
            <span className="min-w-0 max-w-[42vw] overflow-hidden text-ellipsis whitespace-nowrap">
              {workbench.browserState.remoteDebuggingUrl ||
                workbench.browserState.url ||
                workbench.notice ||
                "Awaiting target acquisition"}
            </span>
          </span>
        </nav>

        <section
          className={cn(
            revealClass,
            "relative mt-4 grid min-h-0 min-w-0 flex-1 overflow-hidden border border-rule shadow-bureau [animation-delay:300ms] [grid-template-rows:auto_minmax(0,1fr)]",
            "bg-[linear-gradient(180deg,rgba(26,29,36,0.65),rgba(10,11,14,0.85))]",
            "before:pointer-events-none before:absolute before:-left-px before:-top-px before:z-[4] before:h-3.5 before:w-3.5 before:border before:border-b-0 before:border-r-0 before:border-signal/55 before:content-['']",
            "after:pointer-events-none after:absolute after:-bottom-px after:-right-px after:z-[4] after:h-3.5 after:w-3.5 after:border after:border-l-0 after:border-t-0 after:border-signal/55 after:content-['']"
          )}
        >
          <div className="relative flex items-end justify-between gap-4 border-b border-rule bg-[linear-gradient(180deg,rgba(255,87,51,0.04),transparent_70%)] px-6 pb-4 pt-5 after:absolute after:bottom-[-1px] after:left-6 after:right-6 after:h-px after:bg-[linear-gradient(90deg,var(--color-signal),transparent_50%)] after:content-[''] max-[640px]:flex-col max-[640px]:items-start max-[640px]:px-4">
            <div className="flex items-end gap-5">
              <span className="font-display text-[78px] font-bold leading-[0.78] tracking-[0] text-rule [-webkit-text-stroke:1px_rgba(237,229,210,0.18)] [font-stretch:75%] max-[1180px]:text-[50px]">
                {workbench.meta.num.replace(/(\d)$/, "")}
                <em className="not-italic text-signal [-webkit-text-stroke:0]">{workbench.meta.num.slice(-1)}</em>
              </span>
              <div>
                <span className="mb-1.5 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal">
                  {workbench.meta.eyebrow}
                </span>
                <h2 className="font-display text-[36px] font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
                  {workbench.meta.title}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button
                variant="outline"
                type="button"
                onClick={() => workbench.setAiPaletteOpen(true)}
                title="Command palette (⌘K)"
                data-testid="openAiPalette"
                data-component="openAiPalette"
              >
                <Bot size={14} strokeWidth={1.7} />
                AI
              </Button>
              {workbench.activeView === "traffic" && (
                <>
                  <Button
                    variant="outline"
                    onClick={workbench.createLocalSession}
                    title="Open a fresh local session"
                    data-testid="createLocalSession"
                    data-component="createLocalSession"
                  >
                    <FilePlus2 size={14} strokeWidth={1.7} />
                    New Session
                  </Button>
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={workbench.clearCaptures}
                    title="Clear log"
                    data-testid="clearCaptures"
                    data-component="clearCaptures"
                  >
                    <Eraser size={15} strokeWidth={1.7} />
                  </Button>
                </>
              )}
              {workbench.activeView === "repeater" && (
                <Button
                  variant="outline"
                  onClick={() => workbench.addTarget(workbench.draft.url)}
                  data-testid="trustOrigin"
                  data-component="trustOrigin"
                >
                  <Target size={14} strokeWidth={1.7} />
                  Trust Origin
                </Button>
              )}
              {workbench.activeView === "scope" && (
                <Button
                  variant="solid"
                  size="compact"
                  onClick={() => workbench.saveTargets()}
                  data-testid="commitTargets"
                  data-component="commitTargets"
                >
                  Commit
                </Button>
              )}
              {workbench.activeView === "ssl" && (
                <span className="max-w-[340px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tracking-[0.04em] text-muted">
                  {workbench.notice}
                </span>
              )}
            </div>
          </div>

          {workbench.activeView === "traffic" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(0,1.15fr)_minmax(380px,0.85fr)] max-[1180px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule bg-[linear-gradient(180deg,rgba(0,0,0,0.2),transparent_30%),repeating-linear-gradient(180deg,rgba(237,229,210,0.012)_0_30px,transparent_30px_60px)] max-[1180px]:border-r-0 max-[1180px]:border-b">
                {workbench.trafficCaptures.length === 0 && (
                  <EmptyState>
                    <Activity size={18} strokeWidth={1.4} />
                    <span>No in-scope transmissions intercepted</span>
                  </EmptyState>
                )}
                {workbench.trafficCaptures.map((capture) => (
                  <Button
                    key={capture.id}
                    variant="ghost"
                    className={trafficRowClass(capture.id === workbench.selected?.id)}
                    onClick={() => workbench.setSelectedId(capture.id)}
                    data-testid={`trafficRow-${capture.id}`}
                    data-component="trafficRow"
                  >
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-signal">
                      {capture.method}
                    </span>
                    <StatusBadge tone={statusTone(capture.status)}>{capture.status || "···"}</StatusBadge>
                    <span className={cn(ellipsisMono, "font-medium text-bone")}>{capture.host}</span>
                    <span className={ellipsisMono}>{capture.path}</span>
                    <span className={ellipsisMono}>{capture.tls ? capture.tls.protocol : capture.type}</span>
                    <span className={ellipsisMono}>{elapsed(capture.durationMs)}</span>
                  </Button>
                ))}
              </div>

              <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
                <div className="flex items-stretch gap-0 border-b border-rule">
                  <Button
                    variant="ghost"
                    className={detailTabClass(workbench.activeDetail === "request")}
                    onClick={() => workbench.setActiveDetail("request")}
                    data-testid="detailTabRequest"
                    data-component="detailTabRequest"
                  >
                    <Square size={9} strokeWidth={2} />
                    Request
                  </Button>
                  <Button
                    variant="ghost"
                    className={detailTabClass(workbench.activeDetail === "response")}
                    onClick={() => workbench.setActiveDetail("response")}
                    data-testid="detailTabResponse"
                    data-component="detailTabResponse"
                  >
                    <Square size={9} strokeWidth={2} />
                    Response
                  </Button>
                  <Button
                    variant="ghost"
                    className={detailTabClass(false)}
                    onClick={() => workbench.cloneToRepeater(workbench.selected)}
                    data-testid="cloneToRepeater"
                    data-component="cloneToRepeater"
                  >
                    <Repeat2 size={13} strokeWidth={1.7} />
                    To Repeater
                  </Button>
                </div>
                <pre className="min-h-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),transparent_40%)] px-5 py-4 text-copy">
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
            <div className="grid min-h-0 [grid-template-columns:minmax(0,1.05fr)_minmax(360px,0.95fr)] max-[1180px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="grid items-center gap-2 px-5 pb-2 pt-5 [grid-template-columns:110px_minmax(0,1fr)]">
                  <Select
                    variant="method"
                    value={workbench.draft.method}
                    onChange={(event) => workbench.setDraft({ ...workbench.draft, method: event.target.value })}
                    data-testid="repeaterMethod"
                    data-component="repeaterMethod"
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </Select>
                  <Input
                    value={workbench.draft.url}
                    onChange={(event) => workbench.setDraft({ ...workbench.draft, url: event.target.value })}
                    spellCheck={false}
                    data-testid="repeaterUrl"
                    data-component="repeaterUrl"
                  />
                </div>

                <FieldLabel htmlFor="headers">
                  Headers
                </FieldLabel>
                <Textarea
                  id="headers"
                  variant="code"
                  className="h-[170px]"
                  value={workbench.headersText}
                  onChange={(event) => workbench.setHeadersText(event.target.value)}
                  spellCheck={false}
                  data-testid="repeaterHeaders"
                  data-component="repeaterHeaders"
                />

                <FieldLabel htmlFor="body">
                  Body
                </FieldLabel>
                <Textarea
                  id="body"
                  variant="code"
                  className="h-[220px]"
                  value={workbench.draft.body}
                  onChange={(event) => workbench.setDraft({ ...workbench.draft, body: event.target.value })}
                  spellCheck={false}
                  data-testid="repeaterBody"
                  data-component="repeaterBody"
                />

                <div className="flex gap-2 px-5 py-4">
                  <Button
                    variant="solid"
                    onClick={workbench.sendReplay}
                    disabled={workbench.replayPending}
                    data-testid="transmitReplay"
                    data-component="transmitReplay"
                  >
                    <Send size={14} strokeWidth={1.8} />
                    {workbench.sendReplayPending ? "Transmitting" : "Transmit"}
                  </Button>
                </div>
              </div>

              <div className="min-h-0 overflow-auto">
                <div className="grid items-end gap-3 border-b border-rule bg-[linear-gradient(180deg,rgba(255,87,51,0.025),transparent_80%)] px-5 py-5 [grid-template-columns:1fr_1fr_1fr_auto]">
                  <div className="grid gap-1.5">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.32em] text-muted">
                      Count
                    </span>
                    <Input
                      variant="compact"
                      type="number"
                      min={1}
                      max={50}
                      value={workbench.count}
                      onChange={(event) => workbench.setCount(Number(event.target.value))}
                      data-testid="burstCount"
                      data-component="burstCount"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.32em] text-muted">
                      Parallel
                    </span>
                    <Input
                      variant="compact"
                      type="number"
                      min={1}
                      max={5}
                      value={workbench.concurrency}
                      onChange={(event) => workbench.setConcurrency(Number(event.target.value))}
                      data-testid="burstConcurrency"
                      data-component="burstConcurrency"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.32em] text-muted">
                      Delay
                    </span>
                    <Input
                      variant="compact"
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
                  <Button
                    variant="zap"
                    onClick={workbench.runBurst}
                    disabled={workbench.replayPending}
                    data-testid="runBurst"
                    data-component="runBurst"
                  >
                    <Zap size={14} strokeWidth={1.8} />
                    {workbench.runBurstPending ? "Saturating" : "Saturate"}
                  </Button>
                </div>

                <div className="mx-5 my-5 min-h-0 overflow-hidden border border-rule bg-ink">
                  <div className="flex h-9 items-center gap-3 border-b border-rule bg-signal/5 px-4 py-2 font-mono text-[10.5px] tracking-[0.06em] text-muted">
                    <StatusDot tone={statusTone(workbench.lastResponse?.status || null)} />
                    <strong className="font-semibold text-bone">
                      {workbench.lastResponse
                        ? `${workbench.lastResponse.status} ${workbench.lastResponse.statusText}`
                        : "No response"}
                    </strong>
                    <span>{elapsed(workbench.lastResponse?.durationMs)}</span>
                    {workbench.lastBurst && <span>{workbench.lastBurst.failures} flagged</span>}
                  </div>
                  <pre className="h-[380px] px-4 py-3 text-bone">
                    {workbench.lastResponse ? bodyPreview(workbench.lastResponse.body) : ""}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {workbench.activeView === "scope" && (
            <div className="grid min-h-0 gap-4 overflow-auto p-5 [grid-template-rows:minmax(0,1fr)_auto]">
              <Textarea
                variant="bare"
                className="h-full min-h-[280px]"
                value={workbench.targetText}
                onChange={(event) => workbench.setTargetText(event.target.value)}
                spellCheck={false}
                placeholder="https://your-target.example"
                data-testid="scopeTargetList"
                data-component="scopeTargetList"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start border-dashed border-signal/30 bg-signal/5 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.32em] text-muted hover:border-signal/55 hover:bg-signal/10 hover:text-bone [&_svg]:text-signal"
                onClick={() => workbench.setAiPaletteOpen(true)}
                data-testid="scopeOpenAiPalette"
                data-component="scopeOpenAiPalette"
              >
                <Bot size={15} strokeWidth={1.7} />
                <span>AI command palette — ⌘K</span>
              </Button>
            </div>
          )}

          {workbench.activeView === "ssl" && (
            <div className="grid min-h-0 gap-4 overflow-auto p-5 [grid-template-columns:minmax(280px,0.7fr)_minmax(340px,1fr)] [grid-template-rows:auto_auto_minmax(0,1fr)] max-[1180px]:grid-cols-1">
              <div className="col-span-2 flex h-16 items-center gap-4 border border-rule bg-signal/5 px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted max-[1180px]:col-span-1">
                <LockKeyhole className="text-signal" size={20} strokeWidth={1.6} />
                <strong className="font-semibold tracking-[0.06em] text-bone">
                  {workbench.proxyState.running ? workbench.proxyState.proxyUrl : "proxy stopped"}
                </strong>
                <span>CA: {workbench.proxyState.caCertPath || "not generated"}</span>
                <span>Profile: {workbench.browserState.profileDir || "opens on demand"}</span>
              </div>

              <div className="col-span-2 grid gap-3 border border-rule bg-[linear-gradient(180deg,rgba(255,87,51,0.025),transparent_70%),rgba(0,0,0,0.25)] p-4 max-[1180px]:col-span-1">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="solid"
                    onClick={workbench.startProxy}
                    data-testid="startProxy"
                    data-component="startProxy"
                  >
                    <Play size={14} strokeWidth={1.8} />
                    Engage Proxy
                  </Button>
                  <Button
                    variant="outline"
                    onClick={workbench.stopProxy}
                    data-testid="stopProxy"
                    data-component="stopProxy"
                  >
                    Disengage
                  </Button>
                  <Button
                    variant="outline"
                    onClick={workbench.ensureProxyCa}
                    data-testid="forgeCa"
                    data-component="forgeCa"
                  >
                    <LockKeyhole size={13} strokeWidth={1.7} />
                    Forge CA
                  </Button>
                </div>
                <div className="grid gap-1.5 font-mono text-[10.5px] tracking-[0.04em] text-muted">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    HTTP proxy: {workbench.proxyState.proxyUrl}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    CA cert: {workbench.proxyState.caCertPath || "—"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    SPKI: {workbench.proxyState.caFingerprint || "—"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    Chrome CDP: {workbench.browserState.remoteDebuggingUrl || "launch browser from Deploy"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    Browser: {workbench.browserState.channel || "not launched"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    Binary: {workbench.browserState.executablePath || "—"}
                  </span>
                </div>
              </div>

              <div className="min-h-0 overflow-auto border border-rule bg-black/25">
                {workbench.sslEvents.length === 0 && <EmptyState>No certificate events</EmptyState>}
                {workbench.sslEvents.map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-1 border-b border-rule px-4 py-3 font-mono text-[10.5px] tracking-[0.03em] text-muted"
                  >
                    <ToneText tone={event.trusted ? "good" : "danger"}>
                      {event.trusted ? "TRUSTED" : "BLOCKED"}
                    </ToneText>
                    <strong className="font-semibold text-bone">{event.error}</strong>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{event.url}</span>
                    <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {event.subjectName || event.issuerName || event.createdAt}
                    </small>
                  </div>
                ))}
              </div>
              <pre className="min-h-0 border border-rule bg-black/25 p-3 text-bone">
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

      <footer
        className={cn(
          revealClass,
          "relative z-[3] flex items-center justify-between border-t border-rule bg-ink/80 px-4 font-mono text-[9px] uppercase tracking-[0.36em] text-muted backdrop-blur-[10px] [animation-delay:380ms]",
          "[grid-column:1/3] [grid-row:2/3] max-[1180px]:[grid-column:1/2] max-[1180px]:[grid-row:3/4]"
        )}
      >
        <div className="flex items-center gap-4 max-[640px]:gap-3">
          <span className="flex items-center gap-2 text-signal">
            <span className="h-1 w-1 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-signal" />
            Radar Online
          </span>
          <span className="flex items-center gap-2">
            UTC <em className="not-italic font-semibold text-bone">{workbench.utc}</em>
          </span>
          <span className="flex items-center gap-2 max-[640px]:hidden">
            Sector <em className="not-italic font-semibold text-bone">03</em>
          </span>
        </div>
        <div className="flex items-center gap-4 max-[640px]:hidden">
          <span className="flex items-center gap-2">
            View <em className="not-italic font-semibold text-bone">{workbench.meta.num}</em> · {workbench.meta.label}
          </span>
          <span className="flex items-center gap-2">
            Captures <em className="not-italic font-semibold text-bone">{workbench.captures.length}</em>
          </span>
          <span className="flex items-center gap-2">
            TLS <em className="not-italic font-semibold text-bone">{workbench.sslEvents.length}</em>
          </span>
          <span className="flex items-center gap-2">
            Proxy{" "}
            <em className="not-italic font-semibold text-bone">
              {workbench.proxyState.running ? "engaged" : "standby"}
            </em>
          </span>
        </div>
      </footer>
    </main>
  );
}
