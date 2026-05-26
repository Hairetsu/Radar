import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import {
  Activity,
  Braces,
  Bot,
  Code2,
  CircleDot,
  Copy,
  Eraser,
  ExternalLink,
  FileCode2,
  FileLock2,
  FilePlus2,
  LockKeyhole,
  Palette,
  Play,
  Radar as RadarIcon,
  Repeat2,
  Search,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Target,
  Terminal,
  Trash2,
  UserRound,
  Zap
} from "lucide-react";
import { AiSettingsPanel } from "./ai/AiSettingsPanel";
import { CommandPalette } from "./ai/CommandPalette";
import { AppearanceSettingsPanel } from "./components/AppearanceSettingsPanel";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { ProfileSessionPanel } from "./components/ProfileSessionPanel";
import { EmptyState, FieldLabel, StatusBadge, StatusDot, StatusPill, ToneText } from "./components/radar/primitives";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { TRAFFIC_SORT_FIELDS, useRadarWorkbench, viewMeta, WORK_VIEWS } from "./hooks/useRadarWorkbench";
import {
  bodyPreview,
  cn,
  elapsed,
  formatCapturedRequest,
  formatHeaders,
  originFromUrl,
  REQUEST_EXPORT_LABELS,
  statusTone,
  tlsLine,
  type RequestExportFormat
} from "./lib";
import type { CapturedRequest } from "./types";

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
      "bg-signal/[0.06] text-bone after:absolute after:-bottom-px after:-left-px after:-right-px after:h-0.5 after:bg-signal after:shadow-[0_0_14px_color-mix(in_srgb,var(--color-signal)_60%,transparent)] after:content-[''] [&_.num]:text-signal"
  );

const detailTabClass = (active: boolean) =>
  cn(
    "inline-flex h-[38px] items-center gap-2 border-0 border-r border-rule bg-transparent px-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted transition",
    "hover:bg-signal/5 hover:text-bone",
    active && "-mb-px border-b border-signal bg-signal/10 text-signal"
  );

const trafficRowClass = (selected: boolean, focused: boolean) =>
  cn(
    "radar-traffic-row relative grid h-[46px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-4 py-2.5 text-left text-copy transition",
    "justify-stretch normal-case",
    "[grid-template-columns:64px_60px_minmax(120px,0.9fr)_minmax(180px,1.5fr)_90px_60px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-signal before:transition-all before:content-['']",
    "hover:bg-[var(--theme-row-hover)] hover:text-bone hover:before:w-[3px]",
    selected && "bg-[var(--theme-row-active)] text-bone before:w-[3px]",
    focused && "ring-1 ring-inset ring-signal/35"
  );

type RequestMenuState = {
  x: number;
  y: number;
  captureId: string;
};

const requestExportFormats: RequestExportFormat[] = ["curl", "bash", "python", "fetch", "raw"];

const requestMenuActionClass =
  "flex h-9 w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition hover:bg-signal/10 hover:text-bone focus-visible:bg-signal/10 focus-visible:text-bone focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-muted [&_svg]:text-signal";

const requestMenuDangerClass =
  "hover:bg-rust/10 hover:text-rust focus-visible:bg-rust/10 focus-visible:text-rust [&_svg]:text-rust";

function contextMenuPosition(event: MouseEvent<HTMLElement>) {
  const menuWidth = 264;
  const menuHeight = 404;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  return {
    x: Math.max(12, Math.min(event.clientX, viewportWidth - menuWidth - 12)),
    y: Math.max(12, Math.min(event.clientY, viewportHeight - menuHeight - 12))
  };
}

function testIdSuffix(format: RequestExportFormat) {
  return format.slice(0, 1).toUpperCase() + format.slice(1);
}

const modeButtonClass = (active: boolean) =>
  cn(
    "h-8 border px-3 font-mono text-[9.5px] uppercase tracking-[0.2em]",
    active
      ? "border-signal/60 bg-signal/10 text-signal hover:bg-signal/15"
      : "border-rule bg-surface/60 text-muted hover:bg-signal/5 hover:text-bone"
  );

function timelineEntryText(entry: { note?: string; toolCall?: { tool: string }; toolResult?: { tool: string; ok: boolean; error?: string } }) {
  if (entry.toolResult) {
    return entry.toolResult.ok ? `${entry.toolResult.tool} completed` : `${entry.toolResult.tool} blocked: ${entry.toolResult.error}`;
  }
  if (entry.toolCall) {
    if (entry.toolCall.tool === "showView") {
      return "Workbench tab changed";
    }
    return `${entry.toolCall.tool} requested`;
  }
  return entry.note || "Agent step";
}

export function App() {
  const workbench = useRadarWorkbench();
  const [requestMenu, setRequestMenu] = useState<RequestMenuState | null>(null);
  const trafficFiltersActive = Boolean(
    workbench.trafficSearch.trim() ||
      workbench.trafficMethodFilter !== "all" ||
      workbench.trafficTypeFilter !== "all"
  );
  const selectedDetailText = workbench.selected
    ? workbench.activeDetail === "request"
      ? `${workbench.selected.method} ${workbench.selected.url}\n${tlsLine(workbench.selected)}\n\n${formatHeaders(
          workbench.selected.requestHeaders
        )}\n\n${bodyPreview(workbench.selected.requestBody)}`
      : `${workbench.selected.status || ""} ${workbench.selected.statusText}\n${tlsLine(workbench.selected)}\n\n${formatHeaders(
          workbench.selected.responseHeaders
        )}\n\n${bodyPreview(workbench.selected.responseBody)}`
    : "";
  const copySelectedDetail = async () => {
    if (!selectedDetailText) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(selectedDetailText);
      workbench.setNotice(`${workbench.activeDetail === "request" ? "Request" : "Response"} copied`);
    } catch {
      workbench.setNotice("Copy failed");
    }
  };
  const requestMenuCapture = requestMenu
    ? workbench.captures.find((capture) => capture.id === requestMenu.captureId) || null
    : null;
  const requestMenuOrigin = requestMenuCapture ? originFromUrl(requestMenuCapture.url) : "";
  const requestMenuOriginInScope = Boolean(requestMenuOrigin && workbench.targets.includes(requestMenuOrigin));
  const openRequestMenu = (event: MouseEvent<HTMLElement>, capture: CapturedRequest | null = workbench.selected) => {
    if (!capture) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextPosition = contextMenuPosition(event);
    workbench.selectTrafficCapture(capture.id);
    setRequestMenu({ ...nextPosition, captureId: capture.id });
  };
  const copyRequestExport = async (format: RequestExportFormat) => {
    if (!requestMenuCapture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(formatCapturedRequest(requestMenuCapture, format));
      workbench.setNotice(`Request copied as ${REQUEST_EXPORT_LABELS[format]}`);
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };
  const copyRequestUrl = async () => {
    if (!requestMenuCapture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(requestMenuCapture.url);
      workbench.setNotice("Request URL copied");
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };
  const cloneMenuRequest = () => {
    if (requestMenuCapture) {
      workbench.cloneToRepeater(requestMenuCapture);
    }
    setRequestMenu(null);
  };
  const addMenuRequestToScope = async () => {
    if (requestMenuCapture) {
      await workbench.addTarget(requestMenuCapture.url);
    }
    setRequestMenu(null);
  };
  const deleteMenuRequest = async () => {
    if (requestMenuCapture) {
      await workbench.deleteCapture(requestMenuCapture.id);
    }
    setRequestMenu(null);
  };
  useEffect(() => {
    if (!requestMenu) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRequestMenu(null);
      }
    };
    const close = () => setRequestMenu(null);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [requestMenu]);
  useEffect(() => {
    if (requestMenu && !requestMenuCapture) {
      setRequestMenu(null);
    }
  }, [requestMenu, requestMenuCapture]);
  const activeSession = workbench.localContext?.session || null;
  const activeSessionListed = activeSession
    ? workbench.sessions.some((session) => session.id === activeSession.id)
    : false;
  const activeAgentRun = workbench.activeAgentRun;
  const activeAgentRunning = activeAgentRun?.status === "queued" || activeAgentRun?.status === "running";
  const submitAgentGoal = (event: FormEvent) => {
    event.preventDefault();
    void workbench.startAgentRun();
  };

  return (
    <main className={shellClass} data-testid="radarShell" data-component="radarShell">
      <div className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] radar-drift [inset:-10vmax]" />

      <aside
        className={cn(
          revealClass,
          "relative z-[3] flex flex-col items-center justify-between border-r border-rule/80 py-4 [animation-delay:60ms] max-[1180px]:hidden radar-aside-bg radar-chrome",
          "[grid-column:1/2] [grid-row:1/2]"
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
            "flex items-center justify-between border-b border-dashed radar-confidential-rule px-0.5 pb-2.5 font-mono text-[9.5px] uppercase tracking-[0.5em] text-muted [animation-delay:60ms]",
            "max-[640px]:grid max-[640px]:grid-cols-2 max-[640px]:gap-y-1 max-[640px]:text-[8.5px] max-[640px]:tracking-[0.28em]"
          )}
        >
          <span>
            <em className="not-italic font-bold tracking-[0.4em] text-signal">Confidential</em> // Operational
          </span>
          <span className="mx-4 h-px flex-1 radar-dash-rule max-[640px]:hidden" />
          <span>
            {workbench.localContext
              ? `${workbench.localContext.workspace.name} // ${workbench.localContext.session.name}`
              : `Dossier No. R-${workbench.clock.getUTCFullYear()}-0481`}
          </span>
          <span className="mx-4 h-px flex-1 radar-dash-rule max-[640px]:hidden" />
          <span>{workbench.utc}</span>
        </div>

        <header
          className={cn(
            revealClass,
            "relative grid items-end gap-4 pb-3 pt-4 [animation-delay:140ms] [grid-template-columns:minmax(0,1fr)_auto_auto] max-[1180px]:grid-cols-1"
          )}
        >
          <div className="flex min-w-0 items-end gap-3 max-[640px]:items-center">
            <span
              className={cn(
                "relative grid h-[58px] w-[58px] shrink-0 place-items-center border border-rule text-signal max-[640px]:h-12 max-[640px]:w-12",
                "radar-input-gradient",
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

          <div
            className="flex justify-self-end max-[1180px]:justify-self-start"
            data-testid="browserLauncher"
            data-component="browserLauncher"
          >
            <Button
              type="button"
              variant="solid"
              className="h-[46px] px-5"
              onClick={() => workbench.openBrowser()}
              data-testid="openBrowser"
              data-component="openBrowser"
            >
              <ExternalLink size={14} strokeWidth={2} />
              Open Browser
            </Button>
          </div>

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
            <div
              className="inline-flex overflow-hidden border border-rule bg-ink/35"
              data-testid="appModeToggle"
              data-component="appModeToggle"
            >
              <Button
                type="button"
                variant="ghost"
                className={modeButtonClass(workbench.appMode === "manual-first")}
                onClick={() => workbench.setAppMode("manual-first")}
                data-testid="manualFirstMode"
                data-component="appModeButton"
              >
                Manual-First
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={modeButtonClass(workbench.appMode === "ai-first")}
                onClick={() => workbench.setAppMode("ai-first")}
                data-testid="aiFirstMode"
                data-component="appModeButton"
              >
                AI-First
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "relative inline-flex h-8 items-center gap-2 border px-3 font-mono text-[9.5px] uppercase tracking-[0.22em] transition",
                workbench.ai.connected
                  ? "border-jade/40 bg-jade/10 text-jade hover:bg-jade/15"
                  : workbench.ai.checking
                    ? "border-sand/35 bg-sand/10 text-sand hover:bg-sand/15"
                    : "border-rule bg-surface/60 text-muted hover:bg-signal/5 hover:text-bone"
              )}
              onClick={() => workbench.ai.setSettingsOpen(true)}
              title="AI connection settings"
              data-testid="aiConnectionIndicator"
              data-component="aiConnectionIndicator"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  workbench.ai.connected
                    ? "bg-jade text-jade radar-status-live"
                    : workbench.ai.checking
                      ? "animate-pulse bg-sand"
                      : "bg-muted"
                )}
              />
              <Bot size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-[0.05em]">
                ai {workbench.ai.statusLabel}
              </strong>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="compact"
              onClick={() => workbench.setProfileSessionOpen(true)}
              title="Profiles and sessions"
              data-testid="openProfileSessionPanel"
              data-component="openProfileSessionPanel"
            >
              <UserRound size={14} strokeWidth={1.7} />
              Profiles
            </Button>
            <Button
              type="button"
              variant="outline"
              size="compact"
              onClick={() => workbench.appearance.setSettingsOpen(true)}
              title="Appearance settings"
              data-testid="openAppearanceSettings"
              data-component="openAppearanceSettings"
            >
              <Palette size={14} strokeWidth={1.7} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="compact"
              onClick={() => workbench.ai.setSettingsOpen(true)}
              title="AI connection settings"
              data-testid="openAiSettings"
              data-component="openAiSettings"
            >
              <Settings2 size={14} strokeWidth={1.7} />
            </Button>
          </div>
        </header>

        <nav
          className={cn(
            revealClass,
            "relative mt-4 flex h-[46px] items-stretch overflow-x-auto overflow-y-hidden border-y border-rule radar-nav-texture [animation-delay:220ms]",
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
          <div className="ml-auto flex min-w-[260px] items-center gap-2 border-l border-rule px-3 max-[760px]:ml-0">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Session</span>
            <Select
              variant="compact"
              className="h-[30px] min-w-[190px] max-w-[320px] flex-1"
              value={activeSession?.id || ""}
              onChange={(event) => {
                if (event.target.value && event.target.value !== activeSession?.id) {
                  void workbench.loadLocalSession(event.target.value);
                }
              }}
              aria-label="Session selector"
              data-testid="sessionSelector"
              data-component="sessionSelector"
            >
              {workbench.sessions.length === 0 && (
                <option value={activeSession?.id || ""}>
                  {activeSession?.name || "No sessions"}
                </option>
              )}
              {workbench.sessions.length > 0 && activeSession && !activeSessionListed && (
                <option value={activeSession.id}>{activeSession.name}</option>
              )}
              {workbench.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} - {session.captureCount} req
                </option>
              ))}
            </Select>
          </div>
          <span className="inline-flex min-w-0 items-center gap-3 px-4 font-mono text-[10px] tracking-[0.16em] text-muted max-[640px]:hidden">
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
            workbench.appMode === "ai-first" && "[grid-template-rows:auto_auto_minmax(0,1fr)]",
            "radar-workspace",
            "before:pointer-events-none before:absolute before:-left-px before:-top-px before:z-[4] before:h-3.5 before:w-3.5 before:border before:border-b-0 before:border-r-0 before:border-signal/55 before:content-['']",
            "after:pointer-events-none after:absolute after:-bottom-px after:-right-px after:z-[4] after:h-3.5 after:w-3.5 after:border after:border-l-0 after:border-t-0 after:border-signal/55 after:content-['']"
          )}
        >
          <div className="relative flex items-end justify-between gap-4 border-b border-rule radar-panel-gradient px-6 pb-4 pt-5 after:absolute after:bottom-[-1px] after:left-6 after:right-6 after:h-px after:bg-[linear-gradient(90deg,var(--color-signal),transparent_50%)] after:content-[''] max-[640px]:flex-col max-[640px]:items-start max-[640px]:px-4">
            <div className="flex items-end gap-5">
              <span className="font-display text-[78px] font-bold leading-[0.78] tracking-[0] radar-hero-mark [font-stretch:75%] max-[1180px]:text-[50px]">
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
                    onClick={workbench.openNewSessionDialog}
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

          {workbench.appMode === "ai-first" && (
            <div
              className="grid gap-4 border-b border-rule bg-ink/35 p-4 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,1fr)]"
              data-testid="aiFirstConsole"
              data-component="aiFirstConsole"
            >
              <form className="flex min-w-0 flex-col gap-3" onSubmit={submitAgentGoal}>
                <div>
                  <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.28em] text-signal">
                    AI-First Goal
                  </span>
                  <Textarea
                    value={workbench.agentGoal}
                    onChange={(event) => workbench.setAgentGoal(event.target.value)}
                    placeholder="Inspect https://target.test for auth, session, and API hardening issues."
                    className="min-h-[92px]"
                    data-testid="agentGoalInput"
                    data-component="agentGoalInput"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    variant="solid"
                    disabled={activeAgentRunning}
                    data-testid="startAgentRun"
                    data-component="startAgentRun"
                  >
                    <Play size={14} strokeWidth={1.7} />
                    Start Run
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!activeAgentRunning}
                    onClick={workbench.stopAgentRun}
                    data-testid="stopAgentRun"
                    data-component="stopAgentRun"
                  >
                    <Square size={13} strokeWidth={1.8} />
                    Stop
                  </Button>
                  <span className={cn(monoMuted, "ml-auto")}>
                    {activeAgentRun ? activeAgentRun.status : "idle"}
                  </span>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-muted">
                  Manual-First controls stay available below as evidence panes. AI-First can only act inside saved scope and
                  uses stricter replay budgets.
                </p>
              </form>

              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <div className="min-h-[160px] border border-rule bg-surface/55">
                  <div className="flex items-center justify-between border-b border-rule px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Run Timeline</span>
                    {activeAgentRun && <StatusBadge>{activeAgentRun.timeline.length} steps</StatusBadge>}
                  </div>
                  <div className="max-h-[190px] overflow-auto p-3">
                    {!activeAgentRun && <EmptyState>Prompt AI-First to start a scoped run.</EmptyState>}
                    {activeAgentRun?.timeline.slice(-6).map((entry) => (
                      <div key={entry.id} className="mb-2 border-l border-signal/35 pl-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone">
                          {timelineEntryText(entry)}
                        </p>
                        {entry.note && <p className="mt-1 text-[12px] leading-relaxed text-muted">{entry.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-h-[160px] border border-rule bg-surface/55">
                  <div className="flex items-center justify-between border-b border-rule px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Findings Inbox</span>
                    {activeAgentRun && <StatusBadge>{activeAgentRun.findings.length} draft</StatusBadge>}
                  </div>
                  <div className="max-h-[190px] overflow-auto p-3">
                    {!activeAgentRun?.findings.length && <EmptyState>Findings appear after capture inspection.</EmptyState>}
                    {activeAgentRun?.findings.map((finding) => (
                      <div key={finding.id} className="mb-2 border border-rule bg-ink/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="font-display text-[13px] uppercase tracking-[0.05em] text-bone">
                            {finding.title}
                          </strong>
                          <StatusBadge>{finding.confidence}</StatusBadge>
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-copy">{finding.notes}</p>
                        <p className="mt-2 font-mono text-[10px] text-muted">{finding.evidenceRefs.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {workbench.activeView === "traffic" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(0,1.15fr)_minmax(380px,0.85fr)] max-[1180px]:grid-cols-1">
              <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="grid items-center gap-2 border-b border-rule radar-form-gradient px-3 py-3 [grid-template-columns:120px_150px_112px_auto_minmax(140px,1fr)_auto_auto] max-[900px]:grid-cols-1">
                  <Select
                    variant="compact"
                    value={workbench.trafficMethodFilter}
                    onChange={(event) => workbench.setTrafficMethodFilter(event.target.value)}
                    aria-label="Method filter"
                    data-testid="trafficMethodFilter"
                    data-component="trafficMethodFilter"
                  >
                    <option value="all">All methods</option>
                    {workbench.trafficMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </Select>
                  <Select
                    variant="compact"
                    value={workbench.trafficTypeFilter}
                    onChange={(event) => workbench.setTrafficTypeFilter(event.target.value)}
                    aria-label="Resource type filter"
                    data-testid="trafficTypeFilter"
                    data-component="trafficTypeFilter"
                  >
                    <option value="all">All types</option>
                    {workbench.trafficTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                  <Select
                    variant="compact"
                    value={workbench.trafficSortField}
                    onChange={(event) =>
                      workbench.setTrafficSortField(event.target.value as typeof workbench.trafficSortField)
                    }
                    aria-label="Sort traffic by"
                    data-testid="trafficSortField"
                    data-component="trafficSortField"
                  >
                    {TRAFFIC_SORT_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={() =>
                      workbench.setTrafficSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
                    }
                    title={workbench.trafficSortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                    aria-label={workbench.trafficSortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                    data-testid="trafficSortDirection"
                    data-component="trafficSortDirection"
                  >
                    {workbench.trafficSortDirection === "asc" ? (
                      <ArrowUpWideNarrow size={15} strokeWidth={1.7} />
                    ) : (
                      <ArrowDownWideNarrow size={15} strokeWidth={1.7} />
                    )}
                  </Button>
                  <div className="relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal"
                      size={13}
                      strokeWidth={1.8}
                    />
                    <Input
                      variant="compact"
                      className="w-full pl-8"
                      value={workbench.trafficSearch}
                      onChange={(event) => workbench.setTrafficSearch(event.target.value)}
                      placeholder="Search req / resp / URL"
                      spellCheck={false}
                      aria-label="Traffic search"
                      data-testid="trafficSearch"
                      data-component="trafficSearch"
                    />
                  </div>
                  <span className="flex h-9 items-center whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                    {workbench.trafficCaptures.length}/{workbench.scopedTrafficCaptures.length}
                  </span>
                  <Button
                    variant="icon"
                    size="icon"
                    disabled={!trafficFiltersActive}
                    onClick={() => {
                      workbench.setTrafficMethodFilter("all");
                      workbench.setTrafficTypeFilter("all");
                      workbench.setTrafficSearch("");
                    }}
                    title="Clear filters"
                    data-testid="clearTrafficFilters"
                    data-component="clearTrafficFilters"
                  >
                    <Eraser size={15} strokeWidth={1.7} />
                  </Button>
                </div>
                <div className="min-h-0 overflow-auto radar-traffic-list">
                {workbench.trafficCaptures.length === 0 && (
                  <EmptyState>
                    <Activity size={18} strokeWidth={1.4} />
                    <span>
                      {workbench.scopedTrafficCaptures.length === 0
                        ? "No in-scope transmissions intercepted"
                        : "No captures match filters"}
                    </span>
                  </EmptyState>
                )}
                {workbench.trafficCaptures.map((capture) => {
                  const selected = workbench.selectedIds.includes(capture.id);
                  const focused = capture.id === workbench.selected?.id;
                  return (
                  <Button
                    key={capture.id}
                    variant="ghost"
                    className={trafficRowClass(selected, focused)}
                    data-selected={selected ? "true" : "false"}
                    onClick={(event) => workbench.selectTrafficCapture(capture.id, event)}
                    onContextMenu={(event) => openRequestMenu(event, capture)}
                    data-testid={`trafficRow-${capture.id}`}
                    data-component="trafficRow"
                  >
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-signal">
                      {capture.method}
                    </span>
                    <StatusBadge tone={statusTone(capture.status)}>{capture.status || "···"}</StatusBadge>
                    <span className={cn(ellipsisMono, "font-medium text-bone")}>{capture.host}</span>
                    <span className={ellipsisMono}>{capture.path}</span>
                    <span className={ellipsisMono}>{capture.type || capture.source}</span>
                    <span className={ellipsisMono}>{elapsed(capture.durationMs)}</span>
                  </Button>
                  );
                })}
                </div>
              </div>

              <div className="grid min-h-0 radar-detail-pane [grid-template-rows:auto_minmax(0,1fr)]">
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
                  <Button
                    variant="ghost"
                    className={detailTabClass(false)}
                    onClick={() => void copySelectedDetail()}
                    disabled={!selectedDetailText}
                    title="Copy active detail"
                    data-testid="copyTrafficDetail"
                    data-component="copyTrafficDetail"
                  >
                    <Copy size={13} strokeWidth={1.7} />
                    Copy
                  </Button>
                </div>
                <pre
                  className="min-h-0 select-text cursor-text radar-pre-gradient px-5 py-4"
                  onContextMenu={(event) => openRequestMenu(event)}
                  data-testid="trafficDetailText"
                >
                  {selectedDetailText}
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
                <div className="grid items-end gap-3 border-b border-rule radar-form-gradient px-5 py-5 [grid-template-columns:1fr_1fr_1fr_auto]">
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

                <div className="mx-5 my-5 min-h-0 overflow-hidden border border-rule radar-panel">
                  <div className="flex h-9 items-center gap-3 border-b border-rule bg-signal/5 px-4 py-2 font-mono text-[10.5px] tracking-[0.06em] text-muted">
                    <StatusDot tone={statusTone(workbench.lastResponse?.status || null)} />
                    <strong className="font-semibold text-current">
                      {workbench.lastResponse
                        ? `${workbench.lastResponse.status} ${workbench.lastResponse.statusText}`
                        : "No response"}
                    </strong>
                    <span>{elapsed(workbench.lastResponse?.durationMs)}</span>
                    {workbench.lastBurst && <span>{workbench.lastBurst.failures} flagged</span>}
                  </div>
                  <pre className="h-[380px] px-4 py-3">
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

              <div className="col-span-2 grid gap-3 border border-rule radar-card-gradient p-4 max-[1180px]:col-span-1">
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
                    Chrome CDP: {workbench.browserState.remoteDebuggingUrl || "launch browser from Open Browser"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    Browser: {workbench.browserState.channel || "not launched"}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
                    Binary: {workbench.browserState.executablePath || "—"}
                  </span>
                </div>
              </div>

              <div className="min-h-0 overflow-auto border border-rule radar-inset">
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
              <pre className="min-h-0 border border-rule radar-panel p-3">
                {workbench.selected
                  ? `${workbench.selected.url}\n${tlsLine(workbench.selected)}`
                  : ""}
              </pre>
            </div>
          )}
        </section>
      </section>

      <AppearanceSettingsPanel
        open={workbench.appearance.settingsOpen}
        onClose={() => workbench.appearance.setSettingsOpen(false)}
        themeId={workbench.appearance.themeId}
        onThemeChange={workbench.appearance.setTheme}
      />

      <NewSessionDialog
        open={workbench.newSessionOpen}
        name={workbench.newSessionName}
        onNameChange={workbench.setNewSessionName}
        onClose={() => workbench.setNewSessionOpen(false)}
        onCreate={workbench.confirmNewSession}
      />

      <ProfileSessionPanel
        open={workbench.profileSessionOpen}
        onClose={() => workbench.setProfileSessionOpen(false)}
        context={workbench.localContext}
        profiles={workbench.profiles}
        sessions={workbench.sessions}
        profileName={workbench.profileName}
        onProfileNameChange={workbench.setProfileName}
        sessionName={workbench.sessionName}
        onSessionNameChange={workbench.setSessionName}
        onCreateProfile={workbench.createLocalProfile}
        onSaveProfile={workbench.saveLocalProfile}
        onLoadProfile={workbench.loadLocalProfile}
        onCreateSession={workbench.createLocalSession}
        onSaveSession={workbench.saveLocalSession}
        onLoadSession={workbench.loadLocalSession}
      />

      <AiSettingsPanel
        open={workbench.ai.settingsOpen}
        onClose={() => workbench.ai.setSettingsOpen(false)}
        settings={workbench.ai.settings}
        onSettingsChange={workbench.ai.setSettings}
        models={workbench.ai.models}
        modelsLoading={workbench.ai.modelsLoading}
        connected={workbench.ai.connected}
        checking={workbench.ai.checking}
        message={workbench.ai.message}
        error={workbench.ai.error}
        onSave={() => workbench.ai.saveSettings()}
        onProbe={() => workbench.ai.probe()}
        onConnectPreset={(presetId) => workbench.ai.connectPreset(presetId)}
        onCursorLogin={() => workbench.ai.loginCursor()}
        saving={workbench.ai.saving}
        probing={workbench.ai.probing}
        connecting={workbench.ai.connecting}
        cursorLoggingIn={workbench.ai.cursorLoggingIn}
      />

      <CommandPalette
        open={workbench.aiPaletteOpen}
        view={workbench.activeView}
        onClose={() => workbench.setAiPaletteOpen(false)}
        captureIds={workbench.selectedIds}
        captures={workbench.trafficCaptures}
        targets={workbench.targets}
        browserUrl={workbench.browserState.url || workbench.address}
        draft={workbench.draft}
        lastResponse={workbench.lastResponse}
        sslEvents={workbench.sslEvents}
        proxyRunning={workbench.proxyState.running}
        proxyUrl={workbench.proxyState.proxyUrl}
        caCertPath={workbench.proxyState.caCertPath}
        canRun={workbench.ai.canRun}
        onOpenSettings={() => workbench.ai.setSettingsOpen(true)}
        onApplyDraft={workbench.applyAiDraft}
        onPrepareNavigate={workbench.prepareAiNavigate}
        onNotice={workbench.setNotice}
      />

      {requestMenu && requestMenuCapture && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setRequestMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setRequestMenu(null);
          }}
          data-testid="requestContextMenuOverlay"
          data-component="requestContextMenuOverlay"
        >
          <div
            role="menu"
            aria-label="Request actions"
            className="absolute w-[264px] overflow-hidden border border-rule theme-modal-surface shadow-bureau backdrop-blur-xl"
            style={{ left: requestMenu.x, top: requestMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            data-testid="requestContextMenu"
            data-component="requestContextMenu"
          >
            <div className="border-b border-rule bg-signal/5 px-3 py-2">
              <span className="block font-mono text-[9px] uppercase tracking-[0.28em] text-signal">
                Request
              </span>
              <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] text-bone">
                {requestMenuCapture.method} {requestMenuCapture.host || "capture"}
              </strong>
              <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-muted">
                {requestMenuCapture.path || requestMenuCapture.url}
              </span>
            </div>

            <div className="py-1">
              {requestExportFormats.map((format) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  className={requestMenuActionClass}
                  onClick={() => void copyRequestExport(format)}
                  data-testid={`requestMenuCopy${testIdSuffix(format)}`}
                  data-component="requestMenuCopyExport"
                >
                  {format === "curl" || format === "bash" ? (
                    <Terminal size={13} strokeWidth={1.7} />
                  ) : format === "python" ? (
                    <FileCode2 size={13} strokeWidth={1.7} />
                  ) : format === "fetch" ? (
                    <Code2 size={13} strokeWidth={1.7} />
                  ) : (
                    <Braces size={13} strokeWidth={1.7} />
                  )}
                  Copy as {REQUEST_EXPORT_LABELS[format]}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={requestMenuActionClass}
                onClick={() => void copyRequestUrl()}
                data-testid="requestMenuCopyUrl"
                data-component="requestMenuCopyUrl"
              >
                <Copy size={13} strokeWidth={1.7} />
                Copy URL
              </button>
            </div>

            <div className="border-t border-rule py-1">
              <button
                type="button"
                role="menuitem"
                className={requestMenuActionClass}
                onClick={cloneMenuRequest}
                data-testid="requestMenuToRepeater"
                data-component="requestMenuToRepeater"
              >
                <Repeat2 size={13} strokeWidth={1.7} />
                To Repeater
              </button>
              <button
                type="button"
                role="menuitem"
                className={requestMenuActionClass}
                onClick={() => void addMenuRequestToScope()}
                disabled={requestMenuOriginInScope}
                data-testid="requestMenuAddScope"
                data-component="requestMenuAddScope"
              >
                <Target size={13} strokeWidth={1.7} />
                {requestMenuOriginInScope ? "Origin In Scope" : "Add Origin To Scope"}
              </button>
            </div>

            <div className="border-t border-rule py-1">
              <button
                type="button"
                role="menuitem"
                className={cn(requestMenuActionClass, requestMenuDangerClass)}
                onClick={() => void deleteMenuRequest()}
                data-testid="requestMenuDelete"
                data-component="requestMenuDelete"
              >
                <Trash2 size={13} strokeWidth={1.7} />
                Delete Capture
              </button>
            </div>
          </div>
        </div>
      )}

      <footer
        className={cn(
          revealClass,
          "relative z-[3] flex items-center justify-between border-t border-rule px-4 font-mono text-[9px] uppercase tracking-[0.36em] text-muted backdrop-blur-[10px] [animation-delay:380ms] radar-chrome",
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
