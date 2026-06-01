import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  Activity,
  Plus,
  Pin,
  X,
  History,
  GitCompare,
  Variable,
  FolderOpen,
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
  Map,
  Play,
  Radar as RadarIcon,
  Replace,
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
  Zap,
  type LucideIcon
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
import { jsonFormat, jsonMinify, jwtDecode, parseCookieHeader, urlDecode, urlEncode } from "../shared/requestTransforms.js";
import { TRAFFIC_SORT_FIELDS, useRadarWorkbench, viewMeta, WORK_VIEWS, type WorkView } from "./hooks/useRadarWorkbench";
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
import type { CapturedRequest, WebSocketDirection, WebSocketEvent } from "./types";

const shellClass =
  "radar-shell relative grid h-full min-h-full cursor-default overflow-hidden [grid-template-columns:248px_minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)_28px] max-[1180px]:h-auto max-[1180px]:overflow-visible max-[1180px]:[grid-template-columns:1fr] max-[1180px]:[grid-template-rows:auto_auto_28px]";

const revealClass = "opacity-0 animate-[enter_720ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]";

const monoMuted = "font-mono text-[11px] text-muted";

const ellipsisMono = cn(monoMuted, "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap");

const sidebarViewIcons: Record<WorkView, LucideIcon> = {
  traffic: Activity,
  websocket: Braces,
  intercept: FileLock2,
  repeater: Repeat2,
  automate: Zap,
  sitemap: Map,
  scope: Target,
  ssl: LockKeyhole
};

const sidebarViewButtonClass = (active: boolean) =>
  cn(
    "group relative h-auto w-full justify-start gap-3 overflow-hidden border border-transparent bg-transparent px-3.5 py-3 text-left font-sans normal-case tracking-[0] text-copy",
    "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0 before:bg-signal before:transition-all before:duration-300 before:content-['']",
    "hover:border-signal/30 hover:bg-signal/[0.06] hover:text-bone hover:before:w-[3px] hover:[&_.nav-num]:text-signal",
    active &&
      "border-signal/45 bg-signal/[0.09] text-bone shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_34px_-26px_color-mix(in_srgb,var(--color-signal)_70%,transparent)] before:w-[3px] [&_.nav-icon]:border-signal/50 [&_.nav-icon]:bg-signal/10 [&_.nav-icon]:text-signal [&_.nav-num]:text-signal"
  );

const detailTabClass = (active: boolean) =>
  cn(
    "inline-flex h-[38px] items-center gap-2 border-0 border-r border-rule bg-transparent px-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted transition",
    "hover:bg-signal/5 hover:text-bone",
    active && "-mb-px border-b border-signal bg-signal/10 text-signal"
  );

const trafficRowClass = (selected: boolean, focused: boolean) =>
  cn(
    "radar-traffic-row relative grid h-[42px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case",
    "[grid-template-columns:64px_60px_minmax(120px,0.9fr)_minmax(180px,1.5fr)_90px_60px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-signal before:transition-all before:content-['']",
    "hover:bg-[var(--theme-row-hover)] hover:text-bone hover:before:w-[3px]",
    selected && "bg-[var(--theme-row-active)] text-bone before:w-[3px]",
    focused && "ring-1 ring-inset ring-signal/35"
  );

const websocketRowClass = (selected: boolean, focused: boolean) =>
  cn(
    "relative grid h-[52px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case [grid-template-columns:88px_minmax(120px,0.9fr)_minmax(160px,1.4fr)_72px_72px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-steel before:transition-all before:content-['']",
    "hover:bg-steel/5 hover:text-bone hover:before:w-[3px]",
    focused && "ring-1 ring-inset ring-steel/30",
    selected && "bg-steel/[0.08] text-bone before:w-[3px]"
  );

const interceptRowClass = (selected: boolean) =>
  cn(
    "relative grid h-[58px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case [grid-template-columns:76px_minmax(120px,0.8fr)_minmax(180px,1.4fr)_92px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-rust before:transition-all before:content-['']",
    "hover:bg-rust/5 hover:text-bone hover:before:w-[3px]",
    selected && "bg-rust/[0.08] text-bone before:w-[3px]"
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

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}mb`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}kb`;
  }
  return `${value}b`;
}

function websocketDirectionTone(direction: WebSocketDirection): "good" | "warn" | "danger" | "move" | "ghost" {
  if (direction === "received") {
    return "move";
  }
  if (direction === "sent") {
    return "good";
  }
  if (direction === "error") {
    return "danger";
  }
  if (direction === "closed") {
    return "warn";
  }
  return "ghost";
}

function websocketFrameKind(event: WebSocketEvent) {
  if (event.direction === "handshake") {
    return event.status ? `HTTP ${event.status}` : "handshake";
  }
  if (event.direction === "closed") {
    return "closed";
  }
  if (event.direction === "error") {
    return "error";
  }
  if (event.opcode === 1) {
    return "text";
  }
  if (event.opcode === 2) {
    return "binary";
  }
  if (event.opcode === 8) {
    return "close";
  }
  if (event.opcode === 9) {
    return "ping";
  }
  if (event.opcode === 10) {
    return "pong";
  }
  return `op ${event.opcode ?? "?"}`;
}

function websocketPayloadPreview(event: WebSocketEvent) {
  if (event.error) {
    return event.error;
  }
  if (event.payloadData) {
    return event.payloadData.replace(/\s+/g, " ").trim();
  }
  return event.statusText || event.direction;
}

function websocketDetailText(event: WebSocketEvent | null) {
  if (!event) {
    return "";
  }
  return [
    `${event.direction.toUpperCase()} ${event.url}`,
    `ID: ${event.requestId}`,
    `Host: ${event.host}`,
    `Kind: ${websocketFrameKind(event)}`,
    `Size: ${formatBytes(event.size)}`,
    event.status ? `Status: ${event.status} ${event.statusText || ""}`.trim() : "",
    event.error ? `Error: ${event.error}` : "",
    event.initiator ? `Initiator: ${event.initiator}` : "",
    "",
    "Request headers:",
    formatHeaders(event.requestHeaders || {}),
    "",
    "Response headers:",
    formatHeaders(event.responseHeaders || {}),
    "",
    "Payload:",
    bodyPreview(event.payloadData)
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
}

function interceptEvidenceText(capture: CapturedRequest | null) {
  if (!capture?.intercept?.length) {
    return "";
  }
  return capture.intercept
    .map((record) => {
      const resolved = record.resolvedAt ? ` -> ${record.resolvedAt}` : "";
      const edited = record.edited ? " edited" : "";
      return `${record.stage}: ${record.resolution}${edited} (${record.queuedAt}${resolved})${record.note ? `\n${record.note}` : ""}`;
    })
    .join("\n");
}

function rewriteEvidenceText(capture: CapturedRequest | null) {
  if (!capture?.rewrites?.length) {
    return "";
  }
  return capture.rewrites
    .map((hit) => `${hit.stage} rewrite: ${hit.name} (${hit.target}; ${hit.detail})`)
    .join("\n");
}

function evidenceMetadataText(capture: CapturedRequest | null) {
  const text = [interceptEvidenceText(capture), rewriteEvidenceText(capture)].filter(Boolean).join("\n");
  return text ? `\n${text}` : "";
}

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
  const [savedFilterName, setSavedFilterName] = useState("");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [annotationTags, setAnnotationTags] = useState("");
  const [annotationComment, setAnnotationComment] = useState("");
  const [webSocketDirectionFilter, setWebSocketDirectionFilter] = useState<WebSocketDirection | "all">("all");
  const [selectedWebSocketId, setSelectedWebSocketId] = useState("");
  const [selectedWebSocketIds, setSelectedWebSocketIds] = useState<string[]>([]);
  const webSocketSelectionAnchorRef = useRef("");
  const trafficFiltersActive = Boolean(
    workbench.trafficSearch.trim() ||
      workbench.trafficMethodFilter !== "all" ||
      workbench.trafficTypeFilter !== "all"
  );
  const selectedDetailText = workbench.selected
    ? workbench.activeDetail === "request"
      ? `${workbench.selected.method} ${workbench.selected.url}\n${tlsLine(workbench.selected)}${evidenceMetadataText(
          workbench.selected
        )}\n\n${formatHeaders(
          workbench.selected.requestHeaders
        )}\n\n${bodyPreview(workbench.selected.requestBody)}`
      : `${workbench.selected.status || ""} ${workbench.selected.statusText}\n${tlsLine(
          workbench.selected
        )}${evidenceMetadataText(workbench.selected)}\n\n${formatHeaders(
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
  const selectedCapture = workbench.selected;
  const getEvidenceAnnotation = workbench.getEvidenceAnnotation;
  const evidenceAnnotations = workbench.evidenceAnnotations;

  useEffect(() => {
    if (!selectedCapture) {
      setAnnotationTags("");
      setAnnotationComment("");
      return;
    }
    const annotation = getEvidenceAnnotation(selectedCapture.id, "capture");
    setAnnotationTags(annotation.tags.join(", "));
    setAnnotationComment(annotation.comment);
  }, [selectedCapture, getEvidenceAnnotation, evidenceAnnotations]);
  const activeSession = workbench.localContext?.session || null;
  const activeSessionListed = activeSession
    ? workbench.sessions.some((session) => session.id === activeSession.id)
    : false;
  const activeAgentRun = workbench.activeAgentRun;
  const activeAgentRunning = activeAgentRun?.status === "queued" || activeAgentRun?.status === "running";
  const sidebarViewStats: Record<WorkView, string> = {
    traffic: `${workbench.trafficCaptures.length}/${workbench.scopedTrafficCaptures.length} in scope`,
    websocket: `${workbench.filteredWebSocketEvents.length}/${workbench.webSocketEvents.length} frames`,
    intercept: workbench.interceptState.config.requestEnabled
      ? `${workbench.interceptState.queue.length} queued`
      : "requests off",
    repeater: workbench.lastResponse ? `${workbench.lastResponse.status} ${elapsed(workbench.lastResponse.durationMs)}` : "manual replay",
    automate: workbench.activeAutomateSession
      ? `${workbench.activeAutomateSession.results.length}/${workbench.activeAutomateSession.payloads.length} ${workbench.activeAutomateSession.status}`
      : `${workbench.automatePositions.length} positions`,
    sitemap: `${workbench.sitemap.roots.length} hosts`,
    scope: `${workbench.targets.length} targets`,
    ssl: workbench.proxyState.running ? "proxy engaged" : `${workbench.sslEvents.length} tls events`
  };
  const filteredWebSocketEvents = useMemo(() => {
    return workbench.filteredWebSocketEvents.filter((event) => {
      return webSocketDirectionFilter === "all" || event.direction === webSocketDirectionFilter;
    });
  }, [webSocketDirectionFilter, workbench.filteredWebSocketEvents]);
  const selectedWebSocketEvent =
    filteredWebSocketEvents.find((event) => event.id === selectedWebSocketId) || filteredWebSocketEvents[0] || null;
  const selectedWebSocketDetail = websocketDetailText(selectedWebSocketEvent);
  const selectWebSocketEvent = (eventId: string, event?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
    const meta = Boolean(event?.metaKey || event?.ctrlKey);
    const shift = Boolean(event?.shiftKey);

    setSelectedWebSocketId(eventId);
    setSelectedWebSocketIds((current) => {
      if (shift && webSocketSelectionAnchorRef.current) {
        const ids = filteredWebSocketEvents.map((item) => item.id);
        const start = ids.indexOf(webSocketSelectionAnchorRef.current);
        const end = ids.indexOf(eventId);
        if (start === -1 || end === -1) {
          if (meta) {
            return current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId];
          }
          webSocketSelectionAnchorRef.current = eventId;
          return [eventId];
        }
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        const range = ids.slice(from, to + 1);
        return meta ? [...new Set([...current, ...range])] : range;
      }
      if (meta) {
        return current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId];
      }
      webSocketSelectionAnchorRef.current = eventId;
      return [eventId];
    });
  };
  const webSocketConnectionCount = new Set(workbench.webSocketEvents.map((event) => event.requestId)).size;
  const webSocketSentCount = workbench.webSocketEvents.filter((event) => event.direction === "sent").length;
  const webSocketReceivedCount = workbench.webSocketEvents.filter((event) => event.direction === "received").length;
  const webSocketErrorCount = workbench.webSocketEvents.filter((event) => event.direction === "error").length;
  const webSocketPayloadBytes = workbench.webSocketEvents.reduce((total, event) => total + event.size, 0);
  const copySelectedWebSocketDetail = async () => {
    if (!selectedWebSocketDetail) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(selectedWebSocketDetail);
      workbench.setNotice("WebSocket frame copied");
    } catch {
      workbench.setNotice("Copy failed");
    }
  };

  useEffect(() => {
    setSelectedWebSocketIds((current) => {
      const visible = new Set(filteredWebSocketEvents.map((event) => event.id));
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredWebSocketEvents]);
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
          "relative z-[3] flex min-h-0 flex-col border-r border-rule/80 px-3 py-3 [animation-delay:60ms] radar-aside-bg radar-chrome",
          "[grid-column:1/2] [grid-row:1/2]",
          "max-[1180px]:grid max-[1180px]:grid-cols-[auto_minmax(0,1fr)_minmax(210px,auto)] max-[1180px]:items-center max-[1180px]:gap-3 max-[1180px]:border-r-0 max-[1180px]:border-b max-[1180px]:py-2",
          "max-[760px]:grid-cols-1"
        )}
      >
        <div className="flex items-center gap-3 border-b border-rule/80 pb-3 max-[1180px]:border-b-0 max-[1180px]:pb-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center border border-signal/45 bg-signal/10 font-display text-[22px] font-bold tracking-[0] text-bone shadow-[0_0_26px_-18px_var(--color-signal)] [font-stretch:75%]">
            R<span className="text-signal">·</span>
          </span>
          <div className="min-w-0 max-[1180px]:hidden">
            <strong className="block font-display text-[18px] font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
              Radar
            </strong>
            <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[8.5px] uppercase tracking-[0.22em] text-muted">
              Bureau console
            </span>
          </div>
        </div>

        <nav
          className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto max-[1180px]:mt-0 max-[1180px]:flex-row max-[1180px]:overflow-x-auto"
          aria-label="Workbench views"
          data-testid="viewSwitch"
          data-component="viewSwitch"
        >
          {WORK_VIEWS.map((view) => (
            <Button
              key={view}
              variant="ghost"
              className={cn(sidebarViewButtonClass(workbench.activeView === view), "max-[1180px]:min-w-[184px]")}
              onClick={() => workbench.setActiveView(view)}
              aria-current={workbench.activeView === view ? "page" : undefined}
              data-testid={`view-${view}`}
              data-component="viewSwitchButton"
            >
              {(() => {
                const ViewIcon = sidebarViewIcons[view];
                return (
                  <span className="nav-icon grid h-9 w-9 shrink-0 place-items-center border border-rule bg-ink/40 text-muted transition">
                    <ViewIcon size={16} strokeWidth={1.7} />
                  </span>
                );
              })()}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[15px] font-semibold uppercase leading-none tracking-[0.04em] [font-stretch:75%]">
                    {viewMeta[view].label}
                  </span>
                  <span className="nav-num font-mono text-[9px] font-semibold tracking-[0.18em] text-dim transition">
                    {viewMeta[view].num}
                  </span>
                </span>
                <span className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                  {sidebarViewStats[view]}
                </span>
              </span>
            </Button>
          ))}
        </nav>

        <div className="mt-4 grid gap-3 border-t border-rule/80 pt-3 max-[1180px]:mt-0 max-[1180px]:border-t-0 max-[1180px]:pt-0 max-[760px]:hidden">
          <div className="grid gap-1.5">
            <span className="font-mono text-[8.5px] uppercase tracking-[0.28em] text-muted">Session</span>
            <Select
              variant="compact"
              className="h-[32px] w-full"
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
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap border border-rule bg-ink/30 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            {workbench.browserState.remoteDebuggingUrl ||
              workbench.browserState.url ||
              workbench.notice ||
              "Awaiting target acquisition"}
          </span>
        </div>
      </aside>

      <section className="relative z-[2] flex min-h-0 min-w-0 flex-col overflow-hidden px-3.5 py-3 [grid-column:2/3] [grid-row:1/2] max-[1180px]:overflow-visible max-[1180px]:[grid-column:1/2] max-[1180px]:[grid-row:2/3] max-[640px]:px-3">
        <div
          className={cn(
            revealClass,
            "flex items-center justify-between border-b border-dashed radar-confidential-rule px-0.5 pb-2 font-mono text-[9.5px] uppercase tracking-[0.5em] text-muted [animation-delay:60ms]",
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
            "relative grid items-center gap-3 pb-2 pt-3 [animation-delay:140ms] [grid-template-columns:minmax(0,1fr)_auto] max-[1180px]:grid-cols-1"
          )}
        >
          <div className="flex min-w-0 items-end gap-3 max-[640px]:items-center">
            <span
              className={cn(
                "relative grid h-[42px] w-[42px] shrink-0 place-items-center border border-rule text-signal max-[640px]:h-12 max-[640px]:w-12",
                "radar-input-gradient",
                "before:pointer-events-none before:absolute before:inset-2 before:animate-[ping_3.2s_cubic-bezier(0.2,0.6,0.2,1)_infinite] before:rounded-full before:border before:border-signal/50 before:content-['']",
                "after:pointer-events-none after:absolute after:inset-4 after:animate-[ping_3.2s_cubic-bezier(0.2,0.6,0.2,1)_infinite] after:rounded-full after:border after:border-signal/50 after:[animation-delay:1.6s] after:content-['']"
              )}
            >
              <RadarIcon size={22} strokeWidth={1.6} />
            </span>
            <h1 className="font-display text-[clamp(30px,3vw,38px)] font-semibold uppercase leading-[0.78] tracking-[0] text-bone [font-stretch:75%] max-[640px]:text-[38px]">
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
              className="h-[38px] px-4"
              onClick={() => workbench.openBrowser()}
              data-testid="openBrowser"
              data-component="openBrowser"
            >
              <ExternalLink size={14} strokeWidth={2} />
              Open Browser
            </Button>
          </div>

          <div className="col-span-2 flex flex-wrap items-stretch justify-end gap-1.5 max-[1180px]:col-span-1 max-[1180px]:justify-start">
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

        <section
          className={cn(
            revealClass,
            "relative mt-3 grid min-h-0 min-w-0 flex-1 overflow-hidden border border-rule shadow-bureau [animation-delay:220ms] [grid-template-rows:auto_minmax(0,1fr)] max-[1180px]:min-h-[620px] max-[1180px]:overflow-visible",
            workbench.appMode === "ai-first" && "[grid-template-rows:auto_auto_minmax(0,1fr)]",
            "radar-workspace",
            "before:pointer-events-none before:absolute before:-left-px before:-top-px before:z-[4] before:h-3.5 before:w-3.5 before:border before:border-b-0 before:border-r-0 before:border-signal/55 before:content-['']",
            "after:pointer-events-none after:absolute after:-bottom-px after:-right-px after:z-[4] after:h-3.5 after:w-3.5 after:border after:border-l-0 after:border-t-0 after:border-signal/55 after:content-['']"
          )}
        >
          <div className="relative flex items-center justify-between gap-4 border-b border-rule radar-panel-gradient px-4 pb-3 pt-3 after:absolute after:bottom-[-1px] after:left-4 after:right-4 after:h-px after:bg-[linear-gradient(90deg,var(--color-signal),transparent_50%)] after:content-[''] max-[640px]:flex-col max-[640px]:items-start max-[640px]:px-4">
            <div className="flex items-center gap-4">
              <span className="font-display text-[52px] font-bold leading-[0.78] tracking-[0] radar-hero-mark [font-stretch:75%] max-[1180px]:text-[44px]">
                {workbench.meta.num.replace(/(\d)$/, "")}
                <em className="not-italic text-signal [-webkit-text-stroke:0]">{workbench.meta.num.slice(-1)}</em>
              </span>
              <div>
                <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.36em] text-signal">
                  {workbench.meta.eyebrow}
                </span>
                <h2 className="font-display text-[28px] font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
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
              {workbench.activeView === "websocket" && (
                <Button
                  variant="icon"
                  size="icon"
                  onClick={() => {
                    void workbench.clearWebSocketEvents();
                    setSelectedWebSocketId("");
                    setSelectedWebSocketIds([]);
                    webSocketSelectionAnchorRef.current = "";
                  }}
                  title="Clear WebSocket frames"
                  data-testid="clearWebSocketEvents"
                  data-component="clearWebSocketEvents"
                >
                  <Eraser size={15} strokeWidth={1.7} />
                </Button>
              )}
              {workbench.activeView === "intercept" && (
                <>
                  <Button
                    variant={workbench.interceptState.config.requestEnabled ? "solid" : "outline"}
                    type="button"
                    onClick={() =>
                      void workbench.setRequestInterceptEnabled(!workbench.interceptState.config.requestEnabled)
                    }
                    data-testid="toggleRequestIntercept"
                    data-component="toggleRequestIntercept"
                  >
                    <FileLock2 size={14} strokeWidth={1.7} />
                    {workbench.interceptState.config.requestEnabled ? "Requests On" : "Requests Off"}
                  </Button>
                  <Button
                    variant={workbench.interceptState.config.responseEnabled ? "solid" : "outline"}
                    type="button"
                    onClick={() =>
                      void workbench.setResponseInterceptEnabled(!workbench.interceptState.config.responseEnabled)
                    }
                    data-testid="toggleResponseIntercept"
                    data-component="toggleResponseIntercept"
                  >
                    <FileLock2 size={14} strokeWidth={1.7} />
                    {workbench.interceptState.config.responseEnabled ? "Responses On" : "Responses Off"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={workbench.interceptState.queue.length === 0}
                    onClick={() => void workbench.resumeAllIntercepts()}
                    data-testid="resumeAllIntercepts"
                    data-component="resumeAllIntercepts"
                  >
                    <Play size={14} strokeWidth={1.7} />
                    Resume All
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
              {workbench.activeView === "automate" && (
                <Button
                  variant="solid"
                  onClick={() => void workbench.startAutomateSession()}
                  disabled={workbench.automatePositions.length === 0 || workbench.automatePayloads.length === 0}
                  data-testid="startAutomateSessionHeader"
                  data-component="startAutomateSessionHeader"
                >
                  <Play size={14} strokeWidth={1.7} />
                  Start Run
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
            <div className="grid min-h-0 [grid-template-columns:minmax(0,1fr)_minmax(420px,0.75fr)] max-[1180px]:grid-cols-1">
              <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)_minmax(180px,0.42fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="radar-traffic-filter grid items-center gap-2 border-b border-rule radar-form-gradient px-3 py-2.5">
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
                  <div className="traffic-search relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal"
                      size={13}
                      strokeWidth={1.8}
                    />
                    <Input
                      ref={workbench.trafficSearchRef}
                      variant="compact"
                      className="w-full pl-8"
                      value={workbench.trafficSearch}
                      onChange={(event) => workbench.setTrafficSearch(event.target.value)}
                      placeholder="Query: method:POST path:/api status:401,403"
                      spellCheck={false}
                      aria-label="Traffic query"
                      data-testid="trafficSearch"
                      data-component="trafficSearch"
                    />
                  </div>
                  {workbench.trafficQueryError && (
                    <span className="font-mono text-[10px] text-bad" data-testid="trafficQueryError">
                      {workbench.trafficQueryError}
                    </span>
                  )}
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
                {(workbench.trafficSearch.trim() || workbench.savedFilters.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
                    {workbench.trafficSearch.trim() && (
                      <StatusPill live>
                        {workbench.trafficSearch.trim()}
                        <button
                          type="button"
                          className="ml-2 text-muted hover:text-bone"
                          onClick={() => workbench.setTrafficSearch("")}
                          aria-label="Remove query chip"
                        >
                          ×
                        </button>
                      </StatusPill>
                    )}
                    {workbench.savedFilters
                      .filter((filter) => filter.surface !== "websocket")
                      .slice(0, 6)
                      .map((filter) => (
                        <Button
                          key={filter.id}
                          variant="outline"
                          size="compact"
                          onClick={() => workbench.applySavedFilter(filter)}
                          data-testid={`savedFilter-${filter.id}`}
                        >
                          {filter.name}
                        </Button>
                      ))}
                    {workbench.trafficSearch.trim() && (
                      <>
                        <Input
                          variant="compact"
                          className="w-[140px]"
                          value={savedFilterName}
                          onChange={(event) => setSavedFilterName(event.target.value)}
                          placeholder="Filter name"
                          data-testid="savedFilterName"
                        />
                        <Button
                          variant="outline"
                          size="compact"
                          disabled={!savedFilterName.trim()}
                          onClick={() => {
                            void workbench.saveSavedFilter(savedFilterName, workbench.trafficSearch, "traffic");
                            setSavedFilterName("");
                          }}
                          data-testid="saveTrafficFilter"
                        >
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {workbench.selectedIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-rust/5 px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      {workbench.selectedIds.length} selected
                    </span>
                    <Input
                      variant="compact"
                      className="w-[120px]"
                      value={bulkTagValue}
                      onChange={(event) => setBulkTagValue(event.target.value)}
                      placeholder="tag"
                      data-testid="bulkTagInput"
                    />
                    <Button
                      variant="outline"
                      size="compact"
                      disabled={!bulkTagValue.trim()}
                      onClick={() => {
                        void workbench.bulkTagCaptures(workbench.selectedIds, bulkTagValue);
                        setBulkTagValue("");
                      }}
                      data-testid="bulkTagCaptures"
                    >
                      Tag
                    </Button>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => void workbench.bulkExportCaptures(workbench.selectedIds)}
                      data-testid="bulkExportCaptures"
                    >
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => {
                        if (window.confirm(`Delete ${workbench.selectedIds.length} captures?`)) {
                          void workbench.bulkDeleteCaptures(workbench.selectedIds);
                        }
                      }}
                      data-testid="bulkDeleteCaptures"
                    >
                      Delete
                    </Button>
                  </div>
                )}
                <div className="min-h-0 overflow-auto radar-traffic-list">
                {workbench.trafficCaptures.length === 0 && (
                  <EmptyState>
                    <Activity size={18} strokeWidth={1.4} />
                    <span>
                      {workbench.scopedTrafficCaptures.length === 0
                        ? "No in-scope HTTP/S requests intercepted"
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
                    Repeater
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
                {workbench.selected && (
                  <div className="grid gap-2 border-b border-rule px-4 py-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)_auto] max-[900px]:grid-cols-1">
                    <Input
                      variant="compact"
                      value={annotationTags}
                      onChange={(event) => setAnnotationTags(event.target.value)}
                      placeholder="tags: review, auth"
                      data-testid="captureTags"
                    />
                    <Input
                      variant="compact"
                      value={annotationComment}
                      onChange={(event) => setAnnotationComment(event.target.value)}
                      placeholder="comment"
                      data-testid="captureComment"
                    />
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => {
                        void workbench.saveEvidenceAnnotation({
                          evidenceId: workbench.selected!.id,
                          kind: "capture",
                          tags: annotationTags
                            .split(",")
                            .map((tag) => tag.trim().toLowerCase())
                            .filter(Boolean),
                          comment: annotationComment,
                          updatedAt: new Date().toISOString()
                        });
                      }}
                      data-testid="saveCaptureAnnotation"
                    >
                      Save note
                    </Button>
                  </div>
                )}
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

          {workbench.activeView === "websocket" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(0,1fr)_minmax(420px,0.78fr)] max-[1180px]:grid-cols-1">
              <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_auto_minmax(0,1fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(5,minmax(0,1fr))] max-[900px]:grid-cols-2">
                  {[
                    ["Connections", webSocketConnectionCount],
                    ["Frames", workbench.webSocketEvents.length],
                    ["Outbound", webSocketSentCount],
                    ["Inbound", webSocketReceivedCount],
                    ["Payload", formatBytes(webSocketPayloadBytes)]
                  ].map(([label, value]) => (
                    <div key={label} className="radar-card-gradient px-4 py-3">
                      <span className="block font-mono text-[8.5px] uppercase tracking-[0.28em] text-muted">
                        {label}
                      </span>
                      <strong className="mt-1 block font-display text-[24px] font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="grid items-center gap-2 border-b border-rule radar-form-gradient px-3 py-2.5 [grid-template-columns:148px_minmax(180px,1fr)_auto] max-[900px]:grid-cols-1">
                  <Select
                    variant="compact"
                    value={webSocketDirectionFilter}
                    onChange={(event) => setWebSocketDirectionFilter(event.target.value as WebSocketDirection | "all")}
                    aria-label="WebSocket direction filter"
                    data-testid="webSocketDirectionFilter"
                    data-component="webSocketDirectionFilter"
                  >
                    <option value="all">All frames</option>
                    <option value="handshake">Handshake</option>
                    <option value="sent">Sent</option>
                    <option value="received">Received</option>
                    <option value="error">Errors</option>
                    <option value="closed">Closed</option>
                  </Select>
                  <div className="relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
                      size={13}
                      strokeWidth={1.8}
                    />
                    <Input
                      variant="compact"
                      className="w-full pl-8"
                      value={workbench.webSocketSearch}
                      onChange={(event) => workbench.setWebSocketSearch(event.target.value)}
                      placeholder="Query: direction:sent payload:ping"
                      spellCheck={false}
                      aria-label="WebSocket query"
                      data-testid="webSocketSearch"
                      data-component="webSocketSearch"
                    />
                  </div>
                  {workbench.webSocketQueryError && (
                    <span className="font-mono text-[10px] text-bad">{workbench.webSocketQueryError}</span>
                  )}
                  <Button
                    variant="icon"
                    size="icon"
                    disabled={!workbench.webSocketSearch && webSocketDirectionFilter === "all"}
                    onClick={() => {
                      workbench.setWebSocketSearch("");
                      setWebSocketDirectionFilter("all");
                    }}
                    title="Clear WebSocket filters"
                    data-testid="clearWebSocketFilters"
                    data-component="clearWebSocketFilters"
                  >
                    <Eraser size={15} strokeWidth={1.7} />
                  </Button>
                </div>

                <div className="min-h-0 overflow-auto radar-traffic-list">
                  {filteredWebSocketEvents.length === 0 && (
                    <EmptyState>
                      <Braces size={18} strokeWidth={1.4} />
                      <span>
                        {workbench.webSocketEvents.length === 0
                          ? "No WebSocket frames intercepted"
                          : "No WebSocket frames match filters"}
                      </span>
                    </EmptyState>
                  )}
                  {filteredWebSocketEvents.map((event) => {
                    const selected = selectedWebSocketIds.includes(event.id);
                    const focused = event.id === selectedWebSocketEvent?.id;
                    return (
                      <Button
                        key={event.id}
                        variant="ghost"
                        className={websocketRowClass(selected, focused)}
                        data-selected={selected ? "true" : "false"}
                        onClick={(clickEvent) => selectWebSocketEvent(event.id, clickEvent)}
                        data-testid={`webSocketRow-${event.id}`}
                        data-component="webSocketRow"
                      >
                        <StatusBadge tone={websocketDirectionTone(event.direction)}>
                          {event.direction}
                        </StatusBadge>
                        <span className={cn(ellipsisMono, "font-medium text-bone")}>{event.host || "socket"}</span>
                        <span className={ellipsisMono}>{websocketPayloadPreview(event)}</span>
                        <span className={ellipsisMono}>{websocketFrameKind(event)}</span>
                        <span className={ellipsisMono}>{formatBytes(event.size)}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid min-h-0 radar-detail-pane [grid-template-rows:auto_auto_minmax(0,1fr)]">
                <div className="flex items-stretch gap-0 border-b border-rule">
                  <span className="inline-flex h-[38px] items-center gap-2 border-0 border-r border-rule bg-signal/10 px-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-signal">
                    <Square size={9} strokeWidth={2} />
                    Frame
                  </span>
                  <Button
                    variant="ghost"
                    className={detailTabClass(false)}
                    onClick={() => void copySelectedWebSocketDetail()}
                    disabled={!selectedWebSocketDetail}
                    title="Copy WebSocket frame"
                    data-testid="copyWebSocketDetail"
                    data-component="copyWebSocketDetail"
                  >
                    <Copy size={13} strokeWidth={1.7} />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    className={detailTabClass(false)}
                    onClick={() => selectedWebSocketEvent && workbench.loadWebSocketFrameToRepeater(selectedWebSocketEvent)}
                    disabled={!selectedWebSocketEvent}
                    title="Load frame in repeater"
                    data-testid="replayWebSocketFrame"
                  >
                    <Repeat2 size={13} strokeWidth={1.7} />
                    Replay
                  </Button>
                </div>

                <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(3,minmax(0,1fr))]">
                  {[
                    ["Errors", webSocketErrorCount],
                    ["Selected", selectedWebSocketEvent ? websocketFrameKind(selectedWebSocketEvent) : "none"],
                    ["Scope", selectedWebSocketEvent?.allowed ? "in" : "out"]
                  ].map(([label, value]) => (
                    <div key={label} className="bg-ink/35 px-3 py-2">
                      <span className="block font-mono text-[8px] uppercase tracking-[0.24em] text-muted">{label}</span>
                      <strong className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>

                <pre
                  className="min-h-0 select-text cursor-text radar-pre-gradient px-5 py-4"
                  data-testid="webSocketDetailText"
                >
                  {selectedWebSocketDetail}
                </pre>
              </div>
            </div>
          )}

          {workbench.activeView === "intercept" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(0,0.95fr)_minmax(420px,1.05fr)] max-[1180px]:grid-cols-1">
              <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)_minmax(340px,0.9fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(4,minmax(0,1fr))]">
                  {[
                    ["Mode", workbench.interceptState.config.requestEnabled ? "request" : "standby"],
                    ["Queued", workbench.interceptState.queue.length],
                    ["Rules", workbench.interceptRules.length],
                    ["Rewrites", workbench.matchReplaceRules.length]
                  ].map(([label, value]) => (
                    <div key={label} className="radar-card-gradient px-4 py-3">
                      <span className="block font-mono text-[8.5px] uppercase tracking-[0.28em] text-muted">
                        {label}
                      </span>
                      <strong className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[22px] font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="min-h-0 overflow-auto radar-traffic-list" data-testid="interceptQueue">
                  {workbench.interceptState.queue.length === 0 && (
                    <EmptyState>
                      <FileLock2 size={18} strokeWidth={1.4} />
                      <span>
                        {workbench.interceptState.config.requestEnabled || workbench.interceptState.config.responseEnabled
                          ? "No scoped traffic paused"
                          : "Request and response interception are disabled"}
                      </span>
                    </EmptyState>
                  )}
                  {workbench.interceptState.queue.map((item) => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className={interceptRowClass(item.id === workbench.selectedInterceptItem?.id)}
                      onClick={() => workbench.selectInterceptItem(item.id)}
                      data-selected={item.id === workbench.selectedInterceptItem?.id ? "true" : "false"}
                      data-testid={`interceptRow-${item.id}`}
                      data-component="interceptRow"
                    >
                      <StatusBadge tone="warn">{item.stage === "response" ? item.status || "resp" : item.method}</StatusBadge>
                      <span className={cn(ellipsisMono, "font-medium text-bone")}>{item.host}</span>
                      <span className={ellipsisMono}>{item.path}</span>
                      <span className={ellipsisMono}>{item.stage}</span>
                    </Button>
                  ))}
                </div>
                <div className="grid min-h-0 border-t border-rule [grid-template-rows:auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto]">
                  <div className="flex items-center justify-between gap-3 border-b border-rule bg-rust/5 px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Intercept Rules JSON</span>
                    <StatusBadge tone={workbench.interceptRules.length > 0 ? "warn" : "ghost"}>
                      {workbench.interceptRules.length}
                    </StatusBadge>
                  </div>
                  <Textarea
                    variant="code"
                    className="min-h-0 border-0"
                    value={workbench.interceptRulesText}
                    onChange={(event) => workbench.setInterceptRulesText(event.target.value)}
                    spellCheck={false}
                    data-testid="interceptRulesText"
                    data-component="interceptRulesText"
                  />
                  <div className="border-t border-rule px-3 py-2">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full justify-start"
                      onClick={() => void workbench.saveInterceptRules()}
                      data-testid="saveInterceptRules"
                      data-component="saveInterceptRules"
                    >
                      <FileLock2 size={14} strokeWidth={1.7} />
                      Save Rules
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-b border-rule bg-ink/30 px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Match / Replace JSON</span>
                    <StatusBadge tone={workbench.matchReplaceRules.length > 0 ? "warn" : "ghost"}>
                      {workbench.matchReplaceRules.length}
                    </StatusBadge>
                  </div>
                  <Textarea
                    variant="code"
                    className="min-h-0 border-0"
                    value={workbench.matchReplaceRulesText}
                    onChange={(event) => workbench.setMatchReplaceRulesText(event.target.value)}
                    spellCheck={false}
                    data-testid="matchReplaceRulesText"
                    data-component="matchReplaceRulesText"
                  />
                  <div className="border-t border-rule px-3 py-2">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full justify-start"
                      onClick={() => void workbench.saveMatchReplaceRules()}
                      data-testid="saveMatchReplaceRules"
                      data-component="saveMatchReplaceRules"
                    >
                      <Replace size={14} strokeWidth={1.7} />
                      Save Rewrites
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 radar-detail-pane [grid-template-rows:auto_minmax(0,1fr)_auto]">
                <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2">
                  <div className="min-w-0">
                    <span className="block font-mono text-[9px] uppercase tracking-[0.28em] text-rust">
                      {workbench.selectedInterceptItem?.stage === "response" ? "Queued Response Editor" : "Queued Request Editor"}
                    </span>
                    <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-bone">
                      {workbench.selectedInterceptItem
                        ? `${workbench.selectedInterceptItem.host}${workbench.selectedInterceptItem.path}`
                        : "No queued item selected"}
                    </strong>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <StatusBadge tone={workbench.selectedInterceptItem ? "warn" : "ghost"}>
                      {workbench.selectedInterceptItem?.ruleHits?.length
                        ? `${workbench.selectedInterceptItem.ruleHits.length} rule`
                        : workbench.selectedInterceptItem
                          ? "paused"
                          : "idle"}
                    </StatusBadge>
                    {workbench.selectedInterceptItem?.rewrites?.length ? (
                      <StatusBadge tone="warn">{workbench.selectedInterceptItem.rewrites.length} rewrite</StatusBadge>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 overflow-auto">
                  {workbench.selectedInterceptItem?.stage === "response" ? (
                    <div className="grid items-center gap-2 px-5 pb-2 pt-5 [grid-template-columns:110px_minmax(0,1fr)]">
                      <Input
                        variant="compact"
                        type="number"
                        min={100}
                        max={599}
                        value={workbench.interceptResponseStatus}
                        disabled={!workbench.selectedInterceptItem}
                        onChange={(event) => workbench.setInterceptResponseStatus(Number(event.target.value))}
                        data-testid="interceptStatus"
                        data-component="interceptStatus"
                      />
                      <Input
                        value={workbench.interceptResponseStatusText}
                        disabled={!workbench.selectedInterceptItem}
                        onChange={(event) => workbench.setInterceptResponseStatusText(event.target.value)}
                        spellCheck={false}
                        data-testid="interceptStatusText"
                        data-component="interceptStatusText"
                      />
                    </div>
                  ) : (
                    <div className="grid items-center gap-2 px-5 pb-2 pt-5 [grid-template-columns:110px_minmax(0,1fr)]">
                      <Select
                        variant="method"
                        value={workbench.interceptDraft.method}
                        disabled={!workbench.selectedInterceptItem}
                        onChange={(event) =>
                          workbench.setInterceptDraft({ ...workbench.interceptDraft, method: event.target.value })
                        }
                        data-testid="interceptMethod"
                        data-component="interceptMethod"
                      >
                        {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                          <option key={method}>{method}</option>
                        ))}
                      </Select>
                      <Input
                        value={workbench.interceptDraft.url}
                        disabled={!workbench.selectedInterceptItem}
                        onChange={(event) =>
                          workbench.setInterceptDraft({ ...workbench.interceptDraft, url: event.target.value })
                        }
                        spellCheck={false}
                        data-testid="interceptUrl"
                        data-component="interceptUrl"
                      />
                    </div>
                  )}

                  <FieldLabel htmlFor="interceptHeaders">
                    {workbench.selectedInterceptItem?.stage === "response" ? "Response Headers" : "Request Headers"}
                  </FieldLabel>
                  <Textarea
                    id="interceptHeaders"
                    variant="code"
                    className="h-[170px]"
                    value={workbench.interceptHeadersText}
                    disabled={!workbench.selectedInterceptItem}
                    onChange={(event) => workbench.setInterceptHeadersText(event.target.value)}
                    spellCheck={false}
                    data-testid="interceptHeaders"
                    data-component="interceptHeaders"
                  />

                  <FieldLabel htmlFor="interceptBody">
                    {workbench.selectedInterceptItem?.stage === "response" ? "Response Body" : "Request Body"}
                  </FieldLabel>
                  <Textarea
                    id="interceptBody"
                    variant="code"
                    className="h-[220px]"
                    value={workbench.interceptDraft.body}
                    disabled={!workbench.selectedInterceptItem}
                    onChange={(event) =>
                      workbench.setInterceptDraft({ ...workbench.interceptDraft, body: event.target.value })
                    }
                    spellCheck={false}
                    data-testid="interceptBody"
                    data-component="interceptBody"
                  />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-rule radar-form-gradient px-5 py-4">
                  <Button
                    variant="solid"
                    type="button"
                    disabled={!workbench.selectedInterceptItem}
                    onClick={() => void workbench.forwardIntercept()}
                    data-testid="forwardIntercept"
                    data-component="forwardIntercept"
                  >
                    <Send size={14} strokeWidth={1.8} />
                    Forward
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!workbench.selectedInterceptItem}
                    onClick={() => void workbench.dropIntercept()}
                    data-testid="dropIntercept"
                    data-component="dropIntercept"
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                    Drop
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!workbench.selectedInterceptItem}
                    onClick={() => {
                      if (workbench.selectedInterceptItem) {
                        workbench.selectInterceptItem(workbench.selectedInterceptItem.id);
                      }
                    }}
                    data-testid="resetInterceptDraft"
                    data-component="resetInterceptDraft"
                  >
                    <Eraser size={14} strokeWidth={1.7} />
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          )}

          {workbench.activeView === "repeater" && (
            <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
                {workbench.replayTabState.tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    variant={tab.id === workbench.replayTabState.activeTabId ? "solid" : "ghost"}
                    className="h-8 gap-1.5 px-3"
                    onClick={() => void workbench.selectReplayTab(tab.id)}
                    data-testid={`repeaterTab-${tab.id}`}
                  >
                    {tab.pinned && <Pin size={12} strokeWidth={1.8} />}
                    {tab.name}
                    {workbench.replayTabState.tabs.length > 1 && (
                      <X
                        size={12}
                        strokeWidth={1.8}
                        className="opacity-60 hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          void workbench.closeReplayTab(tab.id);
                        }}
                      />
                    )}
                  </Button>
                ))}
                <Button variant="ghost" className="h-8 px-2" onClick={() => void workbench.createReplayTab()} data-testid="createReplayTab">
                  <Plus size={14} strokeWidth={1.8} />
                </Button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Select
                    variant="compact"
                    value={workbench.activeReplayTab?.environmentId || ""}
                    onChange={(event) => void workbench.setReplayTabEnvironment(event.target.value)}
                    data-testid="repeaterEnvironment"
                  >
                    <option value="">No environment</option>
                    {workbench.replayEnvironments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    className="h-8"
                    onClick={() => void workbench.toggleReplayTabPin(workbench.activeReplayTab?.id || "")}
                    data-testid="pinReplayTab"
                  >
                    <Pin size={14} strokeWidth={1.8} />
                  </Button>
                </div>
              </div>

              <div className="grid min-h-0 [grid-template-columns:minmax(0,1.05fr)_minmax(360px,0.95fr)] max-[1180px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="flex flex-wrap gap-2 px-5 pt-4">
                  {(
                    [
                      {
                        label: "URL encode",
                        action: () =>
                          workbench.setDraft({
                            ...workbench.draft,
                            url: urlEncode(workbench.draft.url).value || workbench.draft.url
                          })
                      },
                      {
                        label: "URL decode",
                        action: () =>
                          workbench.setDraft({
                            ...workbench.draft,
                            url: urlDecode(workbench.draft.url).value || workbench.draft.url
                          })
                      },
                      {
                        label: "JSON format",
                        action: () =>
                          workbench.setDraft({
                            ...workbench.draft,
                            body: jsonFormat(workbench.draft.body).value || workbench.draft.body
                          })
                      },
                      {
                        label: "JSON minify",
                        action: () =>
                          workbench.setDraft({
                            ...workbench.draft,
                            body: jsonMinify(workbench.draft.body).value || workbench.draft.body
                          })
                      }
                    ] as const
                  ).map(({ label, action }) => (
                    <Button key={label} variant="ghost" className="h-7 px-2 text-[11px]" onClick={action}>
                      {label}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      const auth = workbench.draft.headers.Authorization || workbench.draft.headers.authorization || "";
                      const decoded = jwtDecode(auth.replace(/^Bearer\s+/i, ""));
                      if (decoded.ok) {
                        workbench.setNotice(`JWT payload loaded into body preview`);
                        workbench.setDraft({ ...workbench.draft, body: decoded.payload });
                      } else {
                        workbench.setNotice(decoded.error || "JWT decode failed");
                      }
                    }}
                  >
                    JWT decode
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      const cookie = workbench.draft.headers.Cookie || workbench.draft.headers.cookie || "";
                      const parsed = parseCookieHeader(cookie);
                      if (parsed.ok) {
                        workbench.setDraft({ ...workbench.draft, body: parsed.value });
                      } else {
                        workbench.setNotice(parsed.error || "Cookie parse failed");
                      }
                    }}
                  >
                    Parse cookies
                  </Button>
                </div>
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
                  <pre className="h-[220px] px-4 py-3">
                    {workbench.lastResponse ? bodyPreview(workbench.lastResponse.body) : ""}
                  </pre>
                </div>

                {workbench.activeReplayTab && workbench.activeReplayTab.history.length > 0 && (
                  <div className="border-t border-rule px-5 py-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
                      <History size={13} strokeWidth={1.7} />
                      Replay history
                    </div>
                    <div className="grid gap-2">
                      {workbench.activeReplayTab.history.slice(0, 8).map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded border border-rule px-3 py-2 text-[12px]">
                          <span>{entry.result.status}</span>
                          <span className="text-muted">{elapsed(entry.result.durationMs)}</span>
                          <span className="truncate text-muted">{entry.draft.method} {entry.draft.url}</span>
                          <Button variant="ghost" className="ml-auto h-7 px-2" onClick={() => workbench.loadReplayHistoryEntry(entry)}>
                            Load
                          </Button>
                          <input
                            type="radio"
                            name="diffLeft"
                            checked={workbench.diffLeftHistoryId === entry.id}
                            onChange={() => workbench.setDiffLeftHistoryId(entry.id)}
                            aria-label="Diff left"
                          />
                          <input
                            type="radio"
                            name="diffRight"
                            checked={workbench.diffRightHistoryId === entry.id}
                            onChange={() => workbench.setDiffRightHistoryId(entry.id)}
                            aria-label="Diff right"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {workbench.replayDiff && (
                  <div className="border-t border-rule px-5 py-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
                      <GitCompare size={13} strokeWidth={1.7} />
                      Response diff
                    </div>
                    <div className="grid gap-1 text-[12px] text-muted">
                      <span>Status: {workbench.replayDiff.statusBefore} → {workbench.replayDiff.statusAfter}</span>
                      <span>Latency delta: {workbench.replayDiff.latencyDeltaMs} ms</span>
                      <span>Body length delta: {workbench.replayDiff.bodyLengthDelta}</span>
                      {workbench.replayDiff.headerDiffs
                        .filter((entry) => entry.change !== "same")
                        .slice(0, 6)
                        .map((entry) => (
                          <span key={entry.key}>
                            {entry.key}: {entry.change}
                          </span>
                        ))}
                    </div>
                    <pre className="mt-3 max-h-[160px] overflow-auto rounded border border-rule px-3 py-2 text-[11px]">
                      {workbench.replayDiff.bodyTextDiff.join("\n")}
                    </pre>
                  </div>
                )}

                {(workbench.replayEnvironments.length > 0 || workbench.replayCollections.length > 0) && (
                  <div className="border-t border-rule px-5 py-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
                      <FolderOpen size={13} strokeWidth={1.7} />
                      Collections
                    </div>
                    {workbench.replayCollections.map((collection) => (
                      <div key={collection.id} className="mb-3">
                        <div className="mb-1 font-semibold">{collection.name}</div>
                        <div className="flex flex-wrap gap-2">
                          {collection.items.slice(0, 6).map((item) => (
                            <Button key={item.id} variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => workbench.loadCollectionItem(item.draft)}>
                              {item.name}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void workbench.saveDraftToCollection(collection.id, workbench.activeReplayTab?.name || "Request")}
                          >
                            Save tab
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void workbench.createReplayEnvironment(`Env ${workbench.replayEnvironments.length + 1}`)}
                      >
                        <Variable size={12} />
                        New environment
                      </Button>
                    </div>
                  </div>
                )}

                {workbench.webSocketReplayDraft && (
                  <div className="border-t border-rule px-5 py-4">
                    <FieldLabel htmlFor="wsReplayPayload">WebSocket replay</FieldLabel>
                    <Textarea
                      id="wsReplayPayload"
                      variant="code"
                      className="h-[120px]"
                      value={workbench.webSocketReplayDraft.payload}
                      onChange={(event) =>
                        workbench.setWebSocketReplayDraft(
                          workbench.webSocketReplayDraft
                            ? { ...workbench.webSocketReplayDraft, payload: event.target.value }
                            : null
                        )
                      }
                      spellCheck={false}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button variant="solid" onClick={() => void workbench.sendWebSocketReplay()}>
                        Send frame
                      </Button>
                      {workbench.webSocketReplayResult && (
                        <span className="self-center text-[12px] text-muted">
                          {workbench.webSocketReplayResult.ok
                            ? `Reply in ${workbench.webSocketReplayResult.durationMs} ms`
                            : workbench.webSocketReplayResult.error}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {workbench.activeView === "automate" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(320px,0.58fr)_minmax(360px,1fr)] max-[1180px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
                <div className="grid gap-4 border-b border-rule radar-form-gradient px-5 py-5">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <FieldLabel htmlFor="automateMarkerName">Marker</FieldLabel>
                      <Input
                        id="automateMarkerName"
                        value={workbench.automateMarkerName}
                        onChange={(event) => workbench.setAutomateMarkerName(event.target.value)}
                        spellCheck={false}
                        data-testid="automateMarkerName"
                        data-component="automateMarkerName"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="automateHeaderName">Header</FieldLabel>
                      <Input
                        id="automateHeaderName"
                        value={workbench.automateHeaderName}
                        onChange={(event) => workbench.setAutomateHeaderName(event.target.value)}
                        spellCheck={false}
                        data-testid="automateHeaderName"
                        data-component="automateHeaderName"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="solid"
                      type="button"
                      onClick={() => workbench.insertAutomateMarker("url")}
                      data-testid="markAutomateUrl"
                      data-component="markAutomateUrl"
                    >
                      <Target size={14} strokeWidth={1.7} />
                      Mark URL
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => workbench.insertAutomateMarker("header")}
                      data-testid="markAutomateHeader"
                      data-component="markAutomateHeader"
                    >
                      <FileCode2 size={14} strokeWidth={1.7} />
                      Mark Header
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => workbench.insertAutomateMarker("body")}
                      data-testid="markAutomateBody"
                      data-component="markAutomateBody"
                    >
                      <Code2 size={14} strokeWidth={1.7} />
                      Mark Body
                    </Button>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                    {workbench.automateMarkerPreview}
                  </span>
                </div>

                <div className="px-5 py-5">
                  <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
                    <Zap size={13} strokeWidth={1.7} />
                    Positions
                    <StatusBadge tone={workbench.automatePositions.length > 0 ? "good" : "ghost"}>
                      {workbench.automatePositions.length}
                    </StatusBadge>
                  </div>
                  {workbench.automatePositions.length === 0 && (
                    <EmptyState>
                      <Zap size={18} strokeWidth={1.4} />
                      <span>No payload positions marked</span>
                    </EmptyState>
                  )}
                  <div className="grid gap-2" data-testid="automatePositions" data-component="automatePositions">
                    {workbench.automatePositions.map((position) => (
                      <div
                        key={position.id}
                        className="grid gap-2 border border-rule bg-ink/30 px-3 py-3 text-[12px] text-copy"
                        data-testid={`automatePosition-${position.id}`}
                        data-component="automatePosition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal">
                            {position.name}
                          </span>
                          <StatusBadge tone={position.location === "body" ? "warn" : position.location === "header" ? "move" : "good"}>
                            {position.location}
                          </StatusBadge>
                        </div>
                        {position.headerName && (
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-muted">
                            {position.headerName}
                          </span>
                        )}
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-dim">
                          {position.preview}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
                <div className="grid gap-4 border-b border-rule px-5 py-5 xl:grid-cols-[minmax(0,0.48fr)_minmax(0,0.26fr)_minmax(0,0.26fr)]">
                  <div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.35fr)]">
                      <div>
                        <FieldLabel htmlFor="automatePayloadSetName">Payload Set</FieldLabel>
                        <Input
                          id="automatePayloadSetName"
                          value={workbench.automatePayloadSetName}
                          onChange={(event) => workbench.setAutomatePayloadSetName(event.target.value)}
                          spellCheck={false}
                          data-testid="automatePayloadSetName"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="automatePayloadSetSelect">Saved</FieldLabel>
                        <Select
                          id="automatePayloadSetSelect"
                          value={workbench.selectedAutomatePayloadSetId}
                          onChange={(event) => workbench.selectAutomatePayloadSet(event.target.value)}
                          data-testid="automatePayloadSetSelect"
                        >
                          <option value="">Inline deck</option>
                          {workbench.automatePayloadSets.map((payloadSet) => (
                            <option key={payloadSet.id} value={payloadSet.id}>
                              {payloadSet.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <FieldLabel htmlFor="automatePayloads">Payloads</FieldLabel>
                    <Textarea
                      id="automatePayloads"
                      variant="code"
                      className="h-[168px]"
                      value={workbench.automatePayloadText}
                      onChange={(event) => workbench.setAutomatePayloadText(event.target.value)}
                      spellCheck={false}
                      data-testid="automatePayloads"
                      data-component="automatePayloads"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button variant="outline" className="h-8" type="button" onClick={() => void workbench.saveAutomatePayloadSet()}>
                        <FilePlus2 size={13} strokeWidth={1.7} />
                        Save Set
                      </Button>
                      <StatusBadge tone={workbench.automatePayloads.length > 0 ? "good" : "ghost"}>
                        {workbench.automatePayloads.length} payloads
                      </StatusBadge>
                    </div>
                  </div>

                  <div className="grid content-start gap-2">
                    <FieldLabel htmlFor="automateSessionName">Run</FieldLabel>
                    <Input
                      id="automateSessionName"
                      value={workbench.automateSessionName}
                      onChange={(event) => workbench.setAutomateSessionName(event.target.value)}
                      spellCheck={false}
                      data-testid="automateSessionName"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label="Automate count"
                        type="number"
                        min={1}
                        max={100}
                        value={workbench.automateLimits.count}
                        onChange={(event) => workbench.updateAutomateLimits({ count: Number(event.target.value) })}
                        data-testid="automateCount"
                      />
                      <Input
                        aria-label="Automate concurrency"
                        type="number"
                        min={1}
                        max={5}
                        value={workbench.automateLimits.concurrency}
                        onChange={(event) => workbench.updateAutomateLimits({ concurrency: Number(event.target.value) })}
                        data-testid="automateConcurrency"
                      />
                      <Input
                        aria-label="Automate delay"
                        type="number"
                        min={0}
                        max={10000}
                        value={workbench.automateLimits.delayMs}
                        onChange={(event) => workbench.updateAutomateLimits({ delayMs: Number(event.target.value) })}
                        data-testid="automateDelay"
                      />
                      <Input
                        aria-label="Automate timeout"
                        type="number"
                        min={1000}
                        max={30000}
                        value={workbench.automateLimits.timeoutMs}
                        onChange={(event) => workbench.updateAutomateLimits({ timeoutMs: Number(event.target.value) })}
                        data-testid="automateTimeout"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="solid"
                        className="h-8"
                        type="button"
                        onClick={() => void workbench.startAutomateSession()}
                        disabled={workbench.automatePositions.length === 0 || workbench.automatePayloads.length === 0}
                        data-testid="startAutomateSession"
                      >
                        <Play size={13} strokeWidth={1.7} />
                        Start
                      </Button>
                      <Button variant="outline" className="h-8 px-2" type="button" onClick={() => void workbench.pauseAutomateSession()}>
                        Pause
                      </Button>
                      <Button variant="outline" className="h-8 px-2" type="button" onClick={() => void workbench.resumeAutomateSession()}>
                        Resume
                      </Button>
                      <Button variant="ghost" className="h-8 px-2" type="button" onClick={() => void workbench.stopAutomateSession()}>
                        <Square size={12} strokeWidth={1.7} />
                        Stop
                      </Button>
                      <Button variant="ghost" className="h-8 px-2" type="button" onClick={() => void workbench.retryAutomateSession()}>
                        <Repeat2 size={12} strokeWidth={1.7} />
                        Retry
                      </Button>
                    </div>
                  </div>

                  <div className="grid content-start gap-2">
                    <FieldLabel htmlFor="automateWordlistPath">Wordlist Ref</FieldLabel>
                    <Input
                      id="automateWordlistPath"
                      value={workbench.automateWordlistPath}
                      onChange={(event) => workbench.setAutomateWordlistPath(event.target.value)}
                      spellCheck={false}
                      placeholder="/path/to/list.txt"
                      data-testid="automateWordlistPath"
                    />
                    <Button variant="outline" className="h-8 w-fit" type="button" onClick={() => void workbench.saveAutomateWordlistReference()}>
                      <FolderOpen size={13} strokeWidth={1.7} />
                      Save Ref
                    </Button>
                    <div className="grid max-h-[120px] gap-1 overflow-auto border border-rule bg-surface/50 p-2">
                      {workbench.automatePayloads.slice(0, 6).map((payload, index) => (
                        <span key={`${payload}-${index}`} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted">
                          {index + 1}. {payload}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-auto px-5 py-5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
                    <div className="grid gap-4">
                      <div className="overflow-hidden border border-rule radar-panel">
                        <div className="flex min-w-0 items-center gap-3 border-b border-rule bg-signal/5 px-4 py-2 font-mono text-[10.5px] text-muted">
                          <StatusDot tone="warn" />
                          <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-current">
                            {workbench.automatePreviewDraft.method} {workbench.automatePreviewDraft.url}
                          </strong>
                          <Button
                            variant="ghost"
                            className="ml-auto h-7 px-2 text-[10px]"
                            type="button"
                            onClick={workbench.loadAutomatePreviewIntoRepeater}
                            disabled={workbench.automatePositions.length === 0 || workbench.automatePayloads.length === 0}
                            data-testid="loadAutomatePreviewInline"
                          >
                            <Repeat2 size={12} strokeWidth={1.7} />
                            Load
                          </Button>
                        </div>
                        <pre className="max-h-[240px] min-h-[180px] overflow-auto px-4 py-3" data-testid="automatePreview">
                          {`${workbench.automatePreviewDraft.method} ${workbench.automatePreviewDraft.url}\n\n${formatHeaders(
                            workbench.automatePreviewDraft.headers
                          )}\n\n${bodyPreview(workbench.automatePreviewDraft.body)}`}
                        </pre>
                      </div>

                      <div className="overflow-hidden border border-rule bg-ink/25">
                        <div className="border-b border-rule px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
                          Match / Extract Rules
                        </div>
                        <Textarea
                          variant="code"
                          className="h-[170px] rounded-none border-0"
                          value={workbench.automateRulesText}
                          onChange={(event) => workbench.setAutomateRulesText(event.target.value)}
                          spellCheck={false}
                          data-testid="automateRules"
                        />
                        <div className="flex items-center gap-2 border-t border-rule px-4 py-2">
                          <StatusBadge tone={workbench.automateRules.length > 0 ? "good" : "ghost"}>
                            {workbench.automateRules.length} rules
                          </StatusBadge>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-h-[520px] gap-4 [grid-template-rows:auto_minmax(0,1fr)_auto]">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px] flex-1">
                          <FieldLabel htmlFor="automateSessionSelect">Session</FieldLabel>
                          <Select
                            id="automateSessionSelect"
                            value={workbench.activeAutomateSessionId}
                            onChange={(event) => workbench.setActiveAutomateSessionId(event.target.value)}
                            data-testid="automateSessionSelect"
                          >
                            {workbench.automateSessions.length === 0 && <option value="">No sessions</option>}
                            {workbench.automateSessions.map((session) => (
                              <option key={session.id} value={session.id}>
                                {session.name} - {session.status}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Select
                          variant="compact"
                          value={workbench.automateResultFilter}
                          onChange={(event) => workbench.setAutomateResultFilter(event.target.value)}
                          data-testid="automateResultFilter"
                        >
                          <option value="all">All results</option>
                          <option value="failures">Failures</option>
                          <option value="matches">Matches</option>
                          <option value="outliers">Outliers</option>
                        </Select>
                        <Select
                          variant="compact"
                          value={workbench.automateResultSort}
                          onChange={(event) => workbench.setAutomateResultSort(event.target.value)}
                          data-testid="automateResultSort"
                        >
                          <option value="index">Order</option>
                          <option value="status">Status</option>
                          <option value="length">Length</option>
                          <option value="latency">Latency</option>
                          <option value="matches">Matches</option>
                        </Select>
                        <Button
                          variant="ghost"
                          className="h-8 px-2"
                          type="button"
                          onClick={() => {
                            const blob = new window.Blob([JSON.stringify(workbench.activeAutomateSession?.results || [], null, 2)], {
                              type: "application/json"
                            });
                            const url = window.URL.createObjectURL(blob);
                            const link = window.document.createElement("a");
                            link.href = url;
                            link.download = `${workbench.activeAutomateSession?.name || "automate"}-results.json`;
                            link.click();
                            window.URL.revokeObjectURL(url);
                          }}
                        >
                          <ExternalLink size={12} strokeWidth={1.7} />
                          Export
                        </Button>
                      </div>

                      <div className="min-h-0 overflow-auto border border-rule bg-surface/40" data-testid="automateResults">
                        <table className="w-full border-collapse text-left font-mono text-[11px]">
                          <thead className="sticky top-0 bg-ink text-[9.5px] uppercase tracking-[0.24em] text-muted">
                            <tr>
                              <th className="border-b border-rule px-3 py-2">#</th>
                              <th className="border-b border-rule px-3 py-2">Status</th>
                              <th className="border-b border-rule px-3 py-2">Len</th>
                              <th className="border-b border-rule px-3 py-2">Words</th>
                              <th className="border-b border-rule px-3 py-2">Ms</th>
                              <th className="border-b border-rule px-3 py-2">Cluster</th>
                              <th className="border-b border-rule px-3 py-2">Payload</th>
                              <th className="border-b border-rule px-3 py-2">Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workbench.filteredAutomateResults.map((result) => (
                              <tr
                                key={result.id}
                                className={cn(
                                  "cursor-pointer border-b border-rule/70 text-copy hover:bg-signal/10",
                                  workbench.selectedAutomateResult?.id === result.id && "bg-signal/10"
                                )}
                                onClick={() => workbench.setSelectedAutomateResultId(result.id)}
                                data-testid="automateResultRow"
                              >
                                <td className="px-3 py-2 text-dim">{result.index}</td>
                                <td className="px-3 py-2">
                                  <ToneText tone={result.ok && result.status < 400 ? "good" : "danger"}>
                                    {result.error ? "ERR" : result.status}
                                  </ToneText>
                                </td>
                                <td className="px-3 py-2 text-muted">{result.length}</td>
                                <td className="px-3 py-2 text-muted">{result.wordCount}</td>
                                <td className="px-3 py-2 text-muted">{result.latencyMs}</td>
                                <td className="px-3 py-2 text-muted">{result.clusterId || "-"}</td>
                                <td className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-copy">
                                  {result.payload}
                                </td>
                                <td className="px-3 py-2 text-signal">{result.matchedRules.length + result.extracts.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {workbench.filteredAutomateResults.length === 0 && (
                          <EmptyState className="min-h-[240px]">
                            <Zap size={18} strokeWidth={1.4} />
                            <span>No Automate results yet</span>
                          </EmptyState>
                        )}
                      </div>

                      <div className="grid gap-3 border border-rule bg-ink/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(210px,0.35fr)]">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <StatusBadge
                              tone={
                                workbench.activeAutomateSession?.status === "running"
                                  ? "good"
                                  : workbench.activeAutomateSession?.status === "failed"
                                    ? "danger"
                                    : "ghost"
                              }
                            >
                              {workbench.activeAutomateSession?.status || "ready"}
                            </StatusBadge>
                            <StatusBadge tone="move">{workbench.activeAutomateSession?.clusters.length || 0} clusters</StatusBadge>
                            <Button
                              variant="ghost"
                              className="ml-auto h-7 px-2 text-[10px]"
                              type="button"
                              onClick={() => {
                                void window.navigator.clipboard?.writeText(JSON.stringify(workbench.selectedAutomateResult || {}, null, 2));
                              }}
                            >
                              <Copy size={12} strokeWidth={1.7} />
                              Copy Result
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-7 px-2 text-[10px]"
                              type="button"
                              onClick={() => void workbench.promoteAutomateResultToRepeater()}
                              disabled={!workbench.selectedAutomateResult}
                            >
                              <Repeat2 size={12} strokeWidth={1.7} />
                              Promote
                            </Button>
                          </div>
                          <pre className="max-h-[170px] overflow-auto text-[11px]" data-testid="automateResultDetail">
                            {workbench.selectedAutomateResult
                              ? `${workbench.selectedAutomateResult.request.method} ${workbench.selectedAutomateResult.request.url}\n\n${workbench.selectedAutomateResult.bodyPreview || workbench.selectedAutomateResult.error || ""}`
                              : "Select a result to inspect response evidence."}
                          </pre>
                        </div>
                        <div className="grid max-h-[210px] gap-2 overflow-auto">
                          {workbench.activeAutomateSession?.clusters.map((cluster) => (
                            <div key={cluster.id} className="border border-rule bg-surface/50 px-3 py-2 font-mono text-[11px] text-muted">
                              <div className="flex items-center justify-between gap-2 text-copy">
                                <span>{cluster.id}</span>
                                <StatusBadge tone={cluster.count === 1 ? "warn" : "ghost"}>{cluster.count}</StatusBadge>
                              </div>
                              <div className="mt-1 text-dim">
                                {cluster.statusFamily} · {cluster.averageLength}b · {cluster.averageLatencyMs}ms
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {workbench.activeView === "sitemap" && (
            <div className="grid min-h-0 [grid-template-columns:minmax(280px,0.55fr)_minmax(360px,1fr)] max-[1180px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule max-[1180px]:border-r-0 max-[1180px]:border-b">
                {workbench.sitemap.roots.length === 0 && (
                  <EmptyState>
                    <Map size={18} strokeWidth={1.4} />
                    <span>No scoped endpoints mapped yet</span>
                  </EmptyState>
                )}
                {workbench.sitemap.roots.map((hostId) => {
                  const hostNode = workbench.sitemap.nodes[hostId];
                  if (!hostNode) {
                    return null;
                  }
                  return (
                    <div key={hostId} className="border-b border-rule">
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-none px-4 py-3 text-left"
                        onClick={() => workbench.setSelectedSitemapNodeId(hostId)}
                        data-testid={`sitemapHost-${hostId}`}
                      >
                        <strong className="font-mono text-[11px] text-bone">{hostNode.host}</strong>
                        <span className="ml-2 font-mono text-[10px] text-muted">{hostNode.requestCount} reqs</span>
                      </Button>
                      {hostNode.childIds.map((pathId) => {
                        const pathNode = workbench.sitemap.nodes[pathId];
                        if (!pathNode) {
                          return null;
                        }
                        return (
                          <div key={pathId} className="border-t border-rule/70">
                            <Button
                              variant="ghost"
                              className="h-auto w-full justify-start rounded-none py-2 pl-8 pr-4 text-left"
                              onClick={() => workbench.setSelectedSitemapNodeId(pathId)}
                              data-testid={`sitemapPath-${pathId}`}
                            >
                              <span className="font-mono text-[10px] text-copy">{pathNode.path}</span>
                            </Button>
                            {pathNode.childIds.map((endpointId) => {
                              const endpointNode = workbench.sitemap.nodes[endpointId];
                              if (!endpointNode) {
                                return null;
                              }
                              return (
                                <Button
                                  key={endpointId}
                                  variant="ghost"
                                  className="h-auto w-full justify-start rounded-none py-2 pl-12 pr-4 text-left"
                                  onClick={() => workbench.applySitemapNode(endpointNode)}
                                  data-testid={`sitemapEndpoint-${endpointId}`}
                                >
                                  <span className="font-mono text-[10px] text-signal">{endpointNode.methods.join(", ")}</span>
                                  <span className="ml-2 font-mono text-[10px] text-muted">{endpointNode.statusFamilies.join(", ")}</span>
                                </Button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="grid min-h-0 gap-4 overflow-auto p-4 [grid-template-rows:auto_auto_minmax(0,1fr)]">
                <div className="grid gap-2 border border-rule p-3">
                  <FieldLabel>Session diff</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      variant="compact"
                      value={workbench.diffBaselineSessionId}
                      onChange={(event) => workbench.setDiffBaselineSessionId(event.target.value)}
                      data-testid="diffBaselineSession"
                    >
                      <option value="">Baseline session</option>
                      {workbench.sessions
                        .filter((session) => session.id !== workbench.localContext?.session.id)
                        .map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="outline"
                      size="compact"
                      disabled={!workbench.diffBaselineSessionId || workbench.sessionDiffPending}
                      onClick={() => void workbench.runSessionDiff()}
                      data-testid="runSessionDiff"
                    >
                      Compare
                    </Button>
                  </div>
                  {workbench.sessionDiff && (
                    <div className="max-h-40 overflow-auto font-mono text-[10px] text-muted">
                      {workbench.sessionDiff.entries.slice(0, 40).map((entry, index) => (
                        <div key={`${entry.host}-${entry.path}-${entry.method}-${index}`} className="border-b border-rule/60 py-1">
                          <ToneText tone={entry.kind === "added" ? "good" : "danger"}>
                            {entry.kind}
                          </ToneText>{" "}
                          {entry.method} {entry.host}{entry.path} — {entry.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {workbench.selectedSitemapNode && workbench.selectedSitemapInventory && (
                  <div className="grid gap-3 border border-rule p-4 font-mono text-[10px] text-muted">
                    <strong className="text-bone">
                      {workbench.selectedSitemapNode.host}
                      {workbench.selectedSitemapNode.path}
                    </strong>
                    <span>Methods: {workbench.selectedSitemapNode.methods.join(", ") || "—"}</span>
                    <span>Status families: {workbench.selectedSitemapNode.statusFamilies.join(", ") || "—"}</span>
                    <span>Query params: {workbench.selectedSitemapInventory.queryParams.join(", ") || "—"}</span>
                    <span>Body keys: {workbench.selectedSitemapInventory.bodyKeys.join(", ") || "—"}</span>
                    <span>Auth signals: {workbench.selectedSitemapInventory.authSignals.join(", ") || "—"}</span>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => workbench.applySitemapNode(workbench.selectedSitemapNode!)}
                      data-testid="openSitemapInTraffic"
                    >
                      Open in traffic
                    </Button>
                  </div>
                )}
                <div className="border border-rule p-3 font-mono text-[10px] text-muted">
                  <FieldLabel>Query examples</FieldLabel>
                  {workbench.trafficQueryExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="mt-2 block w-full text-left text-copy hover:text-signal"
                      onClick={() => {
                        workbench.setTrafficSearch(example);
                        workbench.setActiveView("traffic");
                      }}
                    >
                      {example}
                    </button>
                  ))}
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
              <div className="grid min-h-0 gap-4 [grid-template-rows:minmax(320px,0.9fr)_minmax(160px,0.55fr)]">
                <div className="grid min-h-0 border border-rule radar-panel [grid-template-rows:auto_auto_minmax(0,1fr)_auto]">
                  <div className="flex items-center justify-between gap-3 border-b border-rule bg-rust/5 px-4 py-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted">Proxy Profiles</span>
                    <StatusBadge tone={workbench.selectedProxyProfile?.notes ? "warn" : "ghost"}>
                      {workbench.selectedProxyProfile?.label || "No profile"}
                    </StatusBadge>
                  </div>
                  <div className="grid gap-2 p-3 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[640px]:grid-cols-1">
                    {workbench.proxyProfiles.map((profile) => (
                      <Button
                        key={profile.id}
                        variant={profile.id === workbench.selectedProxyProfileId ? "solid" : "outline"}
                        type="button"
                        className="h-auto min-h-12 justify-start whitespace-normal text-left"
                        onClick={() => workbench.selectProxyProfile(profile.id)}
                        data-testid={`proxyProfile-${profile.id}`}
                        data-component="proxyProfile"
                      >
                        <Settings2 size={14} strokeWidth={1.7} />
                        {profile.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid min-h-0 gap-2 px-4 pb-3">
                    <span className="font-mono text-[10px] leading-relaxed tracking-[0.04em] text-muted">
                      {workbench.selectedProxyProfile?.hint || "Select a client profile to keep setup notes."}
                    </span>
                    <Textarea
                      variant="code"
                      className="min-h-0"
                      value={workbench.proxyProfileNotes}
                      onChange={(event) => workbench.setProxyProfileNotes(event.target.value)}
                      spellCheck={false}
                      data-testid="proxyProfileNotes"
                      data-component="proxyProfileNotes"
                    />
                  </div>
                  <div className="border-t border-rule px-4 py-3">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full justify-start"
                      onClick={() => void workbench.saveProxyProfile()}
                      disabled={!workbench.selectedProxyProfile}
                      data-testid="saveProxyProfile"
                      data-component="saveProxyProfile"
                    >
                      <FilePlus2 size={14} strokeWidth={1.7} />
                      Save Profile Notes
                    </Button>
                  </div>
                </div>

                <pre className="min-h-0 border border-rule radar-panel p-3">
                  {workbench.selected
                    ? `${workbench.selected.url}\n${tlsLine(workbench.selected)}`
                    : ""}
                </pre>
              </div>
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
        captures={workbench.scopedTrafficCaptures}
        webSocketEventIds={selectedWebSocketIds}
        webSocketEvents={workbench.webSocketEvents}
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
