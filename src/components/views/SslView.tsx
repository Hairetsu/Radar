import { FilePlus2, LockKeyhole, Play, Settings2 } from "lucide-react";
import type { SslProxyDomain } from "../../hooks/workbench/useSslProxyDomain";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import { tlsLine } from "../../lib";
import type { BrowserState } from "../../types";
import { EmptyState, StatusBadge, ToneText } from "../radar/primitives";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export type SslViewActionsProps = Pick<WorkbenchShellDomain, "notice">;

export function SslViewActions({ notice }: SslViewActionsProps) {
  return (
    <span className="max-w-[340px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta tracking-data text-muted">
      {notice}
    </span>
  );
}

export type SslViewProps = Pick<
  SslProxyDomain,
  | "proxyState"
  | "sslEvents"
  | "startProxy"
  | "stopProxy"
  | "ensureProxyCa"
  | "proxyProfiles"
  | "selectedProxyProfile"
  | "selectedProxyProfileId"
  | "selectProxyProfile"
  | "proxyProfileNotes"
  | "setProxyProfileNotes"
  | "saveProxyProfile"
> &
  Pick<TrafficDomain, "selected"> & {
    browserState: BrowserState;
  };

export function SslView({
  proxyState,
  browserState,
  sslEvents,
  startProxy,
  stopProxy,
  ensureProxyCa,
  proxyProfiles,
  selectedProxyProfile,
  selectedProxyProfileId,
  selectProxyProfile,
  proxyProfileNotes,
  setProxyProfileNotes,
  saveProxyProfile,
  selected
}: SslViewProps) {
  return (
    <div className="grid min-h-0 gap-4 overflow-auto p-5 [grid-template-columns:minmax(280px,0.7fr)_minmax(340px,1fr)] [grid-template-rows:auto_auto_minmax(0,1fr)] max-[1180px]:grid-cols-1">
      <div className="col-span-2 flex h-16 items-center gap-4 border border-rule bg-signal/5 px-4 py-3 font-mono text-meta uppercase tracking-label text-muted max-[1180px]:col-span-1">
        <LockKeyhole className="text-signal" size={20} strokeWidth={1.6} />
        <strong className="font-semibold tracking-data text-bone">
          {proxyState.running ? proxyState.proxyUrl : "proxy stopped"}
        </strong>
        <span>CA: {proxyState.caCertPath || "not generated"}</span>
        <span>Profile: {browserState.profileDir || "opens on demand"}</span>
      </div>

      <div className="col-span-2 grid gap-3 border border-rule radar-card-gradient p-4 max-[1180px]:col-span-1">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="solid"
            onClick={startProxy}
            data-testid="startProxy"
            data-component="startProxy"
          >
            <Play size={14} strokeWidth={1.8} />
            Engage Proxy
          </Button>
          <Button
            variant="outline"
            onClick={stopProxy}
            data-testid="stopProxy"
            data-component="stopProxy"
          >
            Disengage
          </Button>
          <Button
            variant="outline"
            onClick={ensureProxyCa}
            data-testid="forgeCa"
            data-component="forgeCa"
          >
            <LockKeyhole size={13} strokeWidth={1.7} />
            Forge CA
          </Button>
        </div>
        <div className="grid gap-1.5 font-mono text-meta tracking-data text-muted">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            HTTP proxy: {proxyState.proxyUrl}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            CA cert: {proxyState.caCertPath || "—"}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            SPKI: {proxyState.caFingerprint || "—"}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            Chrome CDP: {browserState.remoteDebuggingUrl || "launch browser from Open Browser"}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            Playwright: {browserState.automation || "disconnected"} · {browserState.automationPageCount || 0} page(s)
            {browserState.automationError ? ` · ${browserState.automationError}` : ""}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            Browser: {browserState.channel || "not launched"}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap before:mr-1 before:text-signal before:content-['›']">
            Binary: {browserState.executablePath || "—"}
          </span>
        </div>
      </div>

      <div className="min-h-0 overflow-auto border border-rule radar-inset">
        {sslEvents.length === 0 && <EmptyState>No certificate events</EmptyState>}
        {sslEvents.map((event) => (
          <div
            key={event.id}
            className="grid gap-1 border-b border-rule px-4 py-3 font-mono text-meta tracking-data text-muted"
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
            <span className="rd-eyebrow text-muted">Proxy Profiles</span>
            <StatusBadge tone={selectedProxyProfile?.notes ? "warn" : "ghost"}>
              {selectedProxyProfile?.label || "No profile"}
            </StatusBadge>
          </div>
          <div className="grid gap-2 p-3 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[640px]:grid-cols-1">
            {proxyProfiles.map((profile) => (
              <Button
                key={profile.id}
                variant={profile.id === selectedProxyProfileId ? "solid" : "outline"}
                type="button"
                className="h-auto min-h-12 justify-start whitespace-normal text-left"
                onClick={() => selectProxyProfile(profile.id)}
                data-testid={`proxyProfile-${profile.id}`}
                data-component="proxyProfile"
              >
                <Settings2 size={14} strokeWidth={1.7} />
                {profile.label}
              </Button>
            ))}
          </div>
          <div className="grid min-h-0 gap-2 px-4 pb-3">
            <span className="font-mono text-label leading-relaxed tracking-data text-muted">
              {selectedProxyProfile?.hint || "Select a client profile to keep setup notes."}
            </span>
            <Textarea
              variant="code"
              className="min-h-0"
              value={proxyProfileNotes}
              onChange={(event) => setProxyProfileNotes(event.target.value)}
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
              onClick={() => void saveProxyProfile()}
              disabled={!selectedProxyProfile}
              data-testid="saveProxyProfile"
              data-component="saveProxyProfile"
            >
              <FilePlus2 size={14} strokeWidth={1.7} />
              Save Profile Notes
            </Button>
          </div>
        </div>

        <pre className="min-h-0 border border-rule radar-panel p-3">
          {selected
            ? `${selected.url}\n${tlsLine(selected)}`
            : ""}
        </pre>
      </div>
    </div>
  );
}
