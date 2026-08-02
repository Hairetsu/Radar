import {
  Activity,
  Braces,
  FileLock2,
  FileText,
  FlaskConical,
  GitCompare,
  LockKeyhole,
  Map,
  Plug,
  Repeat2,
  Target,
  Zap,
  type LucideIcon
} from "lucide-react";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { cn } from "../../lib";
import { viewMeta, type WorkView } from "../../hooks/workbench/viewMeta";
import type { BrowserState, LocalSession, LocalSessionSummary } from "../../types";
import { ConsoleControls, type ConsoleControlsProps } from "./ConsoleControls";
import { revealClass, sidebarViewButtonClass } from "./layoutClasses";

const sidebarViewIcons: Record<WorkView, LucideIcon> = {
  traffic: Activity,
  websocket: Braces,
  intercept: FileLock2,
  repeater: Repeat2,
  automate: Zap,
  findings: FileText,
  workflows: GitCompare,
  plugins: Plug,
  advanced: FlaskConical,
  sitemap: Map,
  scope: Target,
  ssl: LockKeyhole
};

const sidebarViewGroups: Array<{ label: string; views: WorkView[] }> = [
  { label: "Observe", views: ["traffic", "websocket", "sitemap"] },
  { label: "Test", views: ["intercept", "repeater", "automate", "workflows"] },
  { label: "Report", views: ["findings", "advanced"] },
  { label: "Configure", views: ["plugins", "scope", "ssl"] }
];

export type SidebarProps = {
  activeView: WorkView;
  setActiveView: (view: WorkView) => void;
  sessions: LocalSessionSummary[];
  loadLocalSession: (sessionId: string) => Promise<void>;
  browserState: BrowserState;
  notice: string;
  activeSession: LocalSession | null;
  activeSessionListed: boolean;
  sidebarViewStats: Record<WorkView, string>;
  consoleControls: ConsoleControlsProps;
};

export function Sidebar({
  activeView,
  setActiveView,
  sessions,
  loadLocalSession,
  browserState,
  notice,
  activeSession,
  activeSessionListed,
  sidebarViewStats,
  consoleControls
}: SidebarProps) {
  return (
    <aside
      className={cn(
        revealClass,
        "relative z-[3] flex min-h-0 flex-col border-r border-rule/80 px-3 py-3 [animation-delay:60ms] radar-aside-bg radar-chrome",
        "[grid-column:1/2] [grid-row:1/2]",
        "max-[1180px]:grid max-[1180px]:grid-cols-[auto_minmax(0,1fr)_minmax(190px,auto)_minmax(190px,auto)] max-[1180px]:items-center max-[1180px]:gap-3 max-[1180px]:border-r-0 max-[1180px]:border-b max-[1180px]:py-2",
        "max-[760px]:grid-cols-1"
      )}
      data-testid="sidebar"
      data-component="sidebar"
    >
      <div className="flex items-center gap-3 border-b border-rule/80 pb-3 max-[1180px]:border-b-0 max-[1180px]:pb-0">
        <span className="grid h-10 w-10 shrink-0 place-items-center border border-signal/45 bg-signal/10 font-display text-head font-bold tracking-[0] text-bone shadow-[0_0_26px_-18px_var(--color-signal)] [font-stretch:75%]">
          R<span className="text-signal">·</span>
        </span>
        <div className="min-w-0">
          {/* The app wordmark is the document heading. It stays in the
              accessibility tree when the rail collapses to a top bar and the
              glyph is all that remains visible. */}
          <h1 className="block font-display text-title font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%] max-[1180px]:sr-only">
            Radar
          </h1>
          <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rd-eyebrow text-muted max-[1180px]:hidden">
            Bureau console
          </span>
        </div>
      </div>

      <nav
        className="mt-2.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5 max-[1180px]:mt-0 max-[1180px]:flex-row max-[1180px]:gap-1 max-[1180px]:overflow-x-auto max-[1180px]:pr-0"
        aria-label="Workbench views"
        data-testid="viewSwitch"
        data-component="viewSwitch"
      >
        {sidebarViewGroups.map((group) => (
          <div key={group.label} className="grid gap-0.5 max-[1180px]:flex max-[1180px]:items-center">
            <span className="px-2 font-mono text-nano font-semibold uppercase tracking-banner text-dim max-[1180px]:hidden">
              {group.label}
            </span>
            <div className="grid max-[1180px]:flex">
              {group.views.map((view) => {
                const active = activeView === view;
                const ViewIcon = sidebarViewIcons[view];
                return (
                  <Button
                    key={view}
                    variant="ghost"
                    className={cn(sidebarViewButtonClass(active), "max-[1180px]:min-w-[156px]")}
                    onClick={() => setActiveView(view)}
                    aria-current={active ? "page" : undefined}
                    data-testid={`view-${view}`}
                    data-component="viewSwitchButton"
                  >
                    <span className="nav-icon grid h-6 w-6 shrink-0 place-items-center border border-rule/70 bg-ink/20 text-muted transition">
                      <ViewIcon size={12} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-body font-semibold uppercase leading-none tracking-data [font-stretch:75%]">
                          {viewMeta[view].label}
                        </span>
                        <span className="nav-num font-mono text-nano font-semibold tracking-label text-dim transition">
                          {viewMeta[view].num}
                        </span>
                      </span>
                      {active && (
                        <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-nano uppercase tracking-key text-muted">
                          {sidebarViewStats[view]}
                        </span>
                      )}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-rule/80 pt-3 max-[1180px]:mt-0 max-[1180px]:border-t-0 max-[1180px]:pt-0">
        <ConsoleControls {...consoleControls} />
      </div>

      <div className="mt-3 grid gap-3 max-[1180px]:mt-0 max-[760px]:hidden">
        <div className="grid gap-1.5">
          <span className="rd-eyebrow text-muted">Session</span>
          <Select
            variant="compact"
            className="h-[32px] w-full"
            value={activeSession?.id || ""}
            onChange={(event) => {
              if (event.target.value && event.target.value !== activeSession?.id) {
                void loadLocalSession(event.target.value);
              }
            }}
            aria-label="Session selector"
            data-testid="sessionSelector"
            data-component="sessionSelector"
          >
            {sessions.length === 0 && (
              <option value={activeSession?.id || ""}>
                {activeSession?.name || "No sessions"}
              </option>
            )}
            {sessions.length > 0 && activeSession && !activeSessionListed && (
              <option value={activeSession.id}>{activeSession.name}</option>
            )}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} - {session.captureCount} req
              </option>
            ))}
          </Select>
        </div>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap border border-rule bg-ink/30 px-3 py-2 rd-label text-muted">
          {browserState.remoteDebuggingUrl ||
            browserState.url ||
            notice ||
            "Awaiting target acquisition"}
        </span>
      </div>
    </aside>
  );
}
