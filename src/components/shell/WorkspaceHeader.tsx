import { Bot, CircleDot } from "lucide-react";
import { StatusPill } from "../radar/primitives";
import { cn } from "../../lib";
import type { BrowserState, LocalContext } from "../../types";
import { BrowserToolbar } from "./BrowserToolbar";
import { revealClass } from "./layoutClasses";
import type { FormEvent } from "react";

export type WorkspaceHeaderProps = {
  localContext: LocalContext | null;
  clock: Date;
  utc: string;
  profileName: string;
  browserState: BrowserState;
  address: string;
  setAddress: (address: string) => void;
  onNavigate: (event: FormEvent) => void;
  onBrowserBack: () => void | Promise<void>;
  onBrowserForward: () => void | Promise<void>;
  onBrowserReload: () => void | Promise<void>;
};

/**
 * Classification rail plus the current-target row. Branding lives in the rail
 * and app-global controls live in ConsoleControls, so this header stays focused
 * on who is operating and which target is loaded.
 */
export function WorkspaceHeader({
  localContext,
  clock,
  utc,
  profileName,
  browserState,
  address,
  setAddress,
  onNavigate,
  onBrowserBack,
  onBrowserForward,
  onBrowserReload
}: WorkspaceHeaderProps) {
  return (
    <>
      <div
        className={cn(
          revealClass,
          "flex items-center justify-between border-b border-dashed radar-confidential-rule px-0.5 pb-1.5 rd-banner text-muted [animation-delay:60ms]",
          "max-[640px]:grid max-[640px]:grid-cols-2 max-[640px]:gap-y-1 max-[640px]:tracking-eyebrow"
        )}
      >
        <span>
          <em className="not-italic font-bold text-signal">Confidential</em> // Operational
        </span>
        <span className="mx-4 h-px flex-1 radar-dash-rule max-[640px]:hidden" />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {localContext
            ? `${localContext.workspace.name} // ${localContext.session.name}`
            : `Dossier No. R-${clock.getUTCFullYear()}-0481`}
        </span>
        <span className="mx-4 h-px flex-1 radar-dash-rule max-[640px]:hidden" />
        <span>{utc}</span>
      </div>

      <header
        className={cn(
          revealClass,
          "relative grid items-center gap-3 pb-2 pt-2.5 [animation-delay:140ms] [grid-template-columns:minmax(0,1fr)_auto] max-[1180px]:grid-cols-1"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h2 className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-head font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
              {profileName || "Field"}
            </h2>
            <span className="mt-0.5 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rd-eyebrow text-muted">
              Attack Surface Workbench
            </span>
          </div>

          <span className="h-8 w-px shrink-0 bg-rule max-[640px]:hidden" />

          <div className="flex shrink-0 items-center gap-1.5">
            <StatusPill live={browserState.open}>
              <CircleDot size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-data text-bone">
                {browserState.open ? browserState.engine : "idle"}
              </strong>
            </StatusPill>
            <StatusPill live={browserState.automation === "ready"}>
              <Bot size={11} strokeWidth={1.8} />
              <strong className="font-semibold tracking-data text-bone">
                pw {browserState.automation || "offline"}
              </strong>
            </StatusPill>
          </div>
        </div>

        <BrowserToolbar
          browserState={browserState}
          address={address}
          setAddress={setAddress}
          onNavigate={onNavigate}
          onBack={onBrowserBack}
          onForward={onBrowserForward}
          onReload={onBrowserReload}
        />
      </header>
    </>
  );
}
