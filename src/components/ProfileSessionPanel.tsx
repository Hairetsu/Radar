import { DatabaseZap, FilePlus2, FolderOpen, Save, UserRound, X } from "lucide-react";
import { useEffect } from "react";
import type { LocalContext, LocalProfile, LocalSessionSummary } from "../types";
import { cn } from "../lib/utils";
import { EmptyState, StatusBadge } from "./radar/primitives";
import { revealClass } from "./shell/layoutClasses";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useRestoreFocus } from "../hooks/useRestoreFocus";

type ProfileSessionPanelProps = {
  open: boolean;
  onClose: () => void;
  context: LocalContext | null;
  profiles: LocalProfile[];
  sessions: LocalSessionSummary[];
  profileName: string;
  onProfileNameChange: (value: string) => void;
  sessionName: string;
  onSessionNameChange: (value: string) => void;
  onCreateProfile: () => Promise<void>;
  onSaveProfile: () => Promise<void>;
  onLoadProfile: (id: string) => Promise<void>;
  onCreateSession: (name?: string) => Promise<void>;
  onSaveSession: () => Promise<void>;
  onLoadSession: (id: string) => Promise<void>;
  onSeedDemoProject: () => Promise<void>;
};

function stamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ProfileSessionPanel({
  open,
  onClose,
  context,
  profiles,
  sessions,
  profileName,
  onProfileNameChange,
  sessionName,
  onSessionNameChange,
  onCreateProfile,
  onSaveProfile,
  onLoadProfile,
  onCreateSession,
  onSaveSession,
  onLoadSession,
  onSeedDemoProject
}: ProfileSessionPanelProps) {
  useRestoreFocus(open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const activeProfileId = context?.profile.id || "";
  const activeSessionId = context?.session.id || "";

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="profileSessionBackdrop"
      data-component="profileSessionBackdrop"
    >
      <div
        className="theme-modal-surface grid max-h-[calc(100vh-5rem)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        data-testid="profileSessionPanel"
        data-component="profileSessionPanel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-label font-semibold uppercase tracking-banner text-signal">
              <FolderOpen size={12} strokeWidth={1.8} /> Local Ledger
            </span>
            <h3 className="font-display text-hero uppercase tracking-key text-bone">Projects & Sessions</h3>
            <p className="mt-1 text-label uppercase tracking-eyebrow text-muted">
              Active · {context ? `${context.profile.name} / ${context.session.name}` : "standby"}
            </p>
          </div>
          <Button type="button" variant="icon" size="icon" onClick={onClose} aria-label="Close projects and sessions panel">
            <X size={15} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="grid min-h-0 gap-5 overflow-hidden [grid-template-columns:minmax(260px,0.8fr)_minmax(360px,1.2fr)] max-[900px]:grid-cols-1 max-[900px]:overflow-auto">
          <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden border border-rule radar-card-gradient">
            <div className="border-b border-rule px-4 py-3">
              <span className="font-mono text-label font-semibold uppercase tracking-banner text-signal">
                Project
              </span>
            </div>
            <div className="grid gap-2 border-b border-rule px-4 py-4">
              <Input
                value={profileName}
                onChange={(event) => onProfileNameChange(event.target.value)}
                placeholder="Client or project"
                data-testid="profileNameInput"
                data-component="profileNameInput"
              />
              <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
                <Button
                  type="button"
                  variant="solid"
                  onClick={() => void onSaveProfile()}
                  disabled={!context}
                  data-testid="saveProfile"
                  data-component="saveProfile"
                >
                  <Save size={13} strokeWidth={1.8} />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onCreateProfile()}
                  data-testid="createProfile"
                  data-component="createProfile"
                >
                  <UserRound size={13} strokeWidth={1.8} />
                  New
                </Button>
              </div>
              <Button
                type="button"
                variant="zap"
                onClick={() => void onSeedDemoProject()}
                data-testid="seedDemoProject"
                data-component="seedDemoProject"
              >
                <DatabaseZap size={13} strokeWidth={1.8} />
                Load Demo
              </Button>
            </div>

            <div className="min-h-0 overflow-auto">
              {profiles.length === 0 && <EmptyState>No projects</EmptyState>}
              {profiles.map((profile, index) => {
                const active = profile.id === activeProfileId;
                return (
                  <div
                    key={profile.id}
                    className={cn(
                      "grid gap-3 border-b border-rule px-4 py-3 transition",
                      revealClass,
                      active ? "bg-signal/[0.08]" : "hover:bg-signal/[0.04]"
                    )}
                    style={{ animationDelay: `${80 + index * 45}ms` }}
                    data-testid={`profileRow-${profile.id}`}
                    data-component="profileRow"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                          {profile.name}
                        </strong>
                        <span className="mt-1 block text-label uppercase tracking-label text-muted">
                          Updated {stamp(profile.updatedAt)}
                        </span>
                      </div>
                      {active && <StatusBadge tone="good">Active</StatusBadge>}
                    </div>
                    <Button
                      type="button"
                      variant={active ? "ghost" : "outline"}
                      size="compact"
                      onClick={() => void onLoadProfile(profile.id)}
                      disabled={active}
                      data-testid={`loadProfile-${profile.id}`}
                      data-component="loadProfile"
                    >
                      <FolderOpen size={12} strokeWidth={1.7} />
                      Load
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden border border-rule radar-card-gradient">
            <div className="border-b border-rule px-4 py-3">
              <span className="font-mono text-label font-semibold uppercase tracking-banner text-signal">
                Session
              </span>
            </div>
            <div className="grid gap-2 border-b border-rule px-4 py-4">
              <Input
                value={sessionName}
                onChange={(event) => onSessionNameChange(event.target.value)}
                placeholder="Session name"
                data-testid="sessionNameInput"
                data-component="sessionNameInput"
              />
              <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
                <Button
                  type="button"
                  variant="solid"
                  onClick={() => void onSaveSession()}
                  disabled={!context}
                  data-testid="saveSession"
                  data-component="saveSession"
                >
                  <Save size={13} strokeWidth={1.8} />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onCreateSession(sessionName)}
                  disabled={!context}
                  data-testid="createSessionFromPanel"
                  data-component="createSessionFromPanel"
                >
                  <FilePlus2 size={13} strokeWidth={1.8} />
                  New
                </Button>
              </div>
            </div>

            <div className="min-h-0 overflow-auto">
              {sessions.length === 0 && <EmptyState>No sessions</EmptyState>}
              {sessions.map((session, index) => {
                const active = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "grid gap-3 border-b border-rule px-4 py-3 transition",
                      revealClass,
                      active ? "bg-signal/[0.08]" : "hover:bg-signal/[0.04]"
                    )}
                    style={{ animationDelay: `${120 + index * 45}ms` }}
                    data-testid={`sessionRow-${session.id}`}
                    data-component="sessionRow"
                  >
                    <div className="grid gap-2">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-head uppercase tracking-data text-bone [font-stretch:75%]">
                            {session.name}
                          </strong>
                          <span className="mt-1 block text-label uppercase tracking-label text-muted">
                            {stamp(session.startedAt)} · updated {stamp(session.updatedAt)}
                          </span>
                        </div>
                        {active && <StatusBadge tone="good">Active</StatusBadge>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={session.captureCount > 0 ? "move" : "ghost"}>
                          {session.captureCount} req
                        </StatusBadge>
                        <StatusBadge tone={session.sslEventCount > 0 ? "warn" : "ghost"}>
                          {session.sslEventCount} tls
                        </StatusBadge>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={active ? "ghost" : "outline"}
                      size="compact"
                      onClick={() => void onLoadSession(session.id)}
                      disabled={active}
                      data-testid={`loadSession-${session.id}`}
                      data-component="loadSession"
                    >
                      <FolderOpen size={12} strokeWidth={1.7} />
                      Load
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
