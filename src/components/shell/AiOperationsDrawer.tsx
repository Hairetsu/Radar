import {
  BookOpenCheck,
  Pause,
  Play,
  Plus,
  RotateCw,
  Square,
  X
} from "lucide-react";
import { AgentMissionGraph } from "../AgentMissionGraph";
import { AgentCapabilityLedger } from "../AgentCapabilityLedger";
import { AgentThoughtstream } from "../AgentThoughtstream";
import { AgentTutorialGuide } from "../AgentTutorialGuide";
import { EmptyState, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
  clampAiDrawerWidth,
  cn,
  recoveryActionLabel,
  timelineEntryText
} from "../../lib";
import { useAiOperationsDrawerController } from "../../hooks/useAiOperationsDrawerController";
import type {
  AgentCapabilityAction,
  AgentMissionSteeringAction,
  AgentRun,
  AgentRunMemoryEntry,
  AgentRunProfile,
  AgentRunProfileId,
  AgentRunRecoveryAction,
  CapturedRequest
} from "../../types";
import { monoMuted } from "./layoutClasses";

export type AiOperationsDrawerProps = {
  onClose: () => void;
  drawerWidth: number;
  onDrawerWidthChange: (width: number) => void;
  agentMemoryTitle: string;
  onAgentMemoryTitleChange: (title: string) => void;
  agentMemoryNotes: string;
  onAgentMemoryNotesChange: (notes: string) => void;
  agentGoal: string;
  setAgentGoal: (goal: string) => void;
  agentProfileId: AgentRunProfileId;
  setAgentProfileId: (profileId: AgentRunProfileId) => void;
  agentProfiles: AgentRunProfile[];
  selectedAgentRunProfile: AgentRunProfile;
  agentTutorialMode: boolean;
  setAgentTutorialMode: (enabled: boolean) => void;
  agentRuns: AgentRun[];
  activeAgentRun: AgentRun | null;
  setSelectedAgentRunId: (runId: string) => void;
  activeAgentBudgetLabels: string[];
  agentRunMemory: AgentRunMemoryEntry[];
  filteredAgentRunMemory: AgentRunMemoryEntry[];
  agentRunMemorySearch: string;
  setAgentRunMemorySearch: (query: string) => void;
  selectedCapture: CapturedRequest | null;
  activeAgentRunning: boolean;
  activeAgentPausable: boolean;
  activeAgentResumable: boolean;
  activeAgentStoppable: boolean;
  activeAgentContinuable: boolean;
  startAgentRun: () => void | Promise<void>;
  pauseAgentRun: () => void;
  resumeAgentRun: () => void;
  continueAgentRun: () => void;
  stopAgentRun: () => void;
  steerAgentMission: (action: AgentMissionSteeringAction) => void | Promise<void>;
  updateAgentCapabilities: (action: AgentCapabilityAction) => void | Promise<void>;
  confirmAgentRunMemoryFromTimeline: (entryId: string) => void | Promise<void>;
  dismissAgentRunMemoryFromTimeline: (entryId: string) => void | Promise<void>;
  recoverAgentRun: (entryId: string, action: AgentRunRecoveryAction) => void;
  createAgentRunMemory: (input: { title: string; notes: string; evidenceRefs: string[] }) => Promise<AgentRunMemoryEntry | null>;
  deleteAgentRunMemory: (entryId: string) => void | Promise<void>;
  setNotice: (notice: string) => void;
};

export function AiOperationsDrawer({
  onClose,
  drawerWidth,
  onDrawerWidthChange,
  agentMemoryTitle,
  onAgentMemoryTitleChange,
  agentMemoryNotes,
  onAgentMemoryNotesChange,
  agentGoal,
  setAgentGoal,
  agentProfileId,
  setAgentProfileId,
  agentProfiles,
  selectedAgentRunProfile,
  agentTutorialMode,
  setAgentTutorialMode,
  agentRuns,
  activeAgentRun,
  setSelectedAgentRunId,
  activeAgentBudgetLabels,
  agentRunMemory,
  filteredAgentRunMemory,
  agentRunMemorySearch,
  setAgentRunMemorySearch,
  selectedCapture,
  activeAgentRunning,
  activeAgentPausable,
  activeAgentResumable,
  activeAgentStoppable,
  activeAgentContinuable,
  startAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  continueAgentRun,
  stopAgentRun,
  steerAgentMission,
  updateAgentCapabilities,
  confirmAgentRunMemoryFromTimeline,
  dismissAgentRunMemoryFromTimeline,
  recoverAgentRun,
  createAgentRunMemory,
  deleteAgentRunMemory,
  setNotice
}: AiOperationsDrawerProps) {
  const {
    activeAgentBudgetExhaustion,
    beginResize: beginAiDrawerResize,
    submitGoal: submitAgentGoal,
    submitMemory: submitAgentMemory
  } = useAiOperationsDrawerController({
    drawerWidth,
    onDrawerWidthChange,
    activeAgentRun,
    startAgentRun,
    agentMemoryTitle,
    agentMemoryNotes,
    selectedCapture,
    createAgentRunMemory,
    onAgentMemoryTitleChange,
    onAgentMemoryNotesChange,
    setNotice
  });

  return (
    <aside
      className="absolute bottom-2 right-2 top-2 z-20 grid min-h-0 max-w-[calc(100vw-24px)] overflow-hidden border border-rule/80 theme-modal-surface shadow-[0_32px_100px_-30px_rgba(0,0,0,0.92)] [grid-template-rows:auto_minmax(0,1fr)] max-[900px]:fixed max-[900px]:bottom-3 max-[900px]:left-3 max-[900px]:right-3 max-[900px]:top-3 max-[900px]:!h-auto max-[900px]:!w-auto"
      style={{ width: `${drawerWidth}px` }}
      aria-label="AI operations drawer"
      data-testid="aiFirstConsole"
      data-component="aiFirstConsole"
    >
      <div
        className="absolute bottom-0 left-0 top-0 z-10 w-2 -translate-x-1/2 cursor-col-resize bg-transparent transition hover:bg-signal/35 focus-visible:bg-signal/50 focus-visible:[outline-offset:-2px] max-[900px]:hidden"
        role="separator"
        aria-label="Resize AI operations drawer"
        aria-orientation="vertical"
        aria-valuemin={420}
        aria-valuemax={820}
        aria-valuenow={drawerWidth}
        tabIndex={0}
        onPointerDown={beginAiDrawerResize}
        onDoubleClick={() => onDrawerWidthChange(620)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
          }
          event.preventDefault();
          const delta = event.key === "ArrowLeft" ? 32 : -32;
          onDrawerWidthChange(clampAiDrawerWidth(drawerWidth + delta, window.innerWidth));
        }}
        data-testid="resizeAiDrawer"
        data-component="resizeAiDrawer"
      />
      <header className="border-b border-rule/70 bg-ink/85 px-4 pb-0 pt-3 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-nano font-semibold uppercase tracking-banner text-signal">AI-First</span>
            <h3 className="mt-1 font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
              Operations Drawer
            </h3>
            <p className="mt-1.5 text-meta leading-relaxed text-muted">
              Run controls and audit state stay beside the evidence—not above it.
            </p>
          </div>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={onClose}
            aria-label="Close AI operations drawer"
            data-testid="closeAiDrawer"
          >
            <X size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain p-4" data-testid="aiDrawerBody">
        <form className="flex min-w-0 flex-col gap-3" onSubmit={submitAgentGoal}>
          <div>
            <span className="mb-1 block rd-eyebrow text-signal">
              AI-First Goal
            </span>
            <Textarea
              value={agentGoal}
              onChange={(event) => setAgentGoal(event.target.value)}
              placeholder="Inspect https://target.test for auth, session, and API hardening issues."
              className="min-h-[92px]"
              data-testid="agentGoalInput"
              data-component="agentGoalInput"
            />
          </div>
          <label className="grid gap-1">
            <span className="rd-eyebrow text-muted">Run Profile</span>
            <Select
              value={agentProfileId}
              onChange={(event) => setAgentProfileId(event.target.value as AgentRunProfileId)}
              disabled={activeAgentRunning}
              data-testid="agentProfileSelect"
              data-component="agentProfileSelect"
            >
              {agentProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </Select>
            <span className="text-meta leading-5 text-muted">{selectedAgentRunProfile.description}</span>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={agentTutorialMode}
            disabled={activeAgentRunning}
            onClick={() => setAgentTutorialMode(!agentTutorialMode)}
            className={cn(
              "group grid grid-cols-[auto_1fr_auto] items-center gap-3 border p-3 text-left transition",
              agentTutorialMode
                ? "border-signal/45 bg-signal/[0.08] text-bone"
                : "border-rule bg-surface/45 text-copy hover:border-signal/30 hover:bg-signal/[0.04]",
              activeAgentRunning && "cursor-not-allowed opacity-55"
            )}
            data-testid="agentTutorialToggle"
            data-component="agentTutorialToggle"
          >
            <BookOpenCheck size={17} strokeWidth={1.6} className="text-signal" />
            <span className="min-w-0">
              <span className="block font-display text-body uppercase tracking-key">Tutorial Mode</span>
              <span className="mt-1 block text-meta leading-4 text-muted">
                AI teaches each clue, pauses, and waits for you to continue.
              </span>
            </span>
            <span
              className={cn(
                "relative h-5 w-9 border border-rule bg-ink/60 transition before:absolute before:left-0.5 before:top-0.5 before:h-3.5 before:w-3.5 before:bg-muted before:transition before:content-['']",
                agentTutorialMode && "border-signal/50 bg-signal/10 before:translate-x-4 before:bg-signal"
              )}
              aria-hidden="true"
            />
          </button>
          {agentRuns.length > 0 && (
            <label className="grid gap-1">
              <span className="rd-eyebrow text-muted">Run History</span>
              <Select
                value={activeAgentRun?.id || ""}
                onChange={(event) => setSelectedAgentRunId(event.target.value)}
                data-testid="agentRunSelect"
                data-component="agentRunSelect"
              >
                {agentRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.status.toUpperCase()} · {run.goal.slice(0, 54)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="solid"
              disabled={activeAgentRunning}
              data-testid="startAgentRun"
              data-component="startAgentRun"
            >
              <Play size={14} strokeWidth={1.7} />
              {agentTutorialMode ? "Start Tutorial" : "Start Run"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!activeAgentPausable}
              onClick={pauseAgentRun}
              data-testid="pauseAgentRun"
              data-component="pauseAgentRun"
            >
              <Pause size={13} strokeWidth={1.8} />
              Pause
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!activeAgentResumable}
              onClick={resumeAgentRun}
              data-testid="resumeAgentRun"
              data-component="resumeAgentRun"
            >
              <Play size={13} strokeWidth={1.8} />
              {activeAgentRun?.policy.tutorialMode ? "Continue Lesson" : "Resume"}
            </Button>
            {activeAgentBudgetExhaustion && (
              <Button
                type="button"
                variant="outline"
                disabled={!activeAgentContinuable}
                onClick={continueAgentRun}
                data-testid="continueAgentRun"
                data-component="continueAgentRun"
              >
                <RotateCw size={13} strokeWidth={1.8} />
                Continue as New Run
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!activeAgentStoppable}
              onClick={stopAgentRun}
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
          <div className="flex flex-wrap gap-1" data-testid="agentBudgetChips">
            {activeAgentBudgetLabels.map((label) => (
              <StatusBadge key={label}>{label}</StatusBadge>
            ))}
          </div>
          {activeAgentBudgetExhaustion && (
            <div
              className="relative overflow-hidden border border-warning/45 bg-warning/[0.07] px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-warning"
              role="status"
              data-testid="agentBudgetExhausted"
            >
              <div className="rd-eyebrow text-warning">
                Active budget spent // checkpoint sealed
              </div>
              <p className="mt-1 font-mono text-label leading-relaxed text-muted">
                {activeAgentBudgetExhaustion.kind === "runtime"
                  ? `${Math.ceil(activeAgentBudgetExhaustion.used / 1000)}s used / ${Math.ceil(activeAgentBudgetExhaustion.limit / 1000)}s allowed.`
                  : `${activeAgentBudgetExhaustion.used} tool calls used / ${activeAgentBudgetExhaustion.limit} allowed.`}
                {" "}Resume cannot reset a safety budget. Continue as New Run starts a fresh bounded run and preserves this transcript.
              </p>
            </div>
          )}
          <p className="font-mono text-label leading-relaxed text-muted">
            Manual-First controls stay available below as evidence panes. AI-First can only act inside saved scope and
            uses stricter replay budgets.
          </p>
        </form>

        {/* Run state is never tab-gated: recovery prompts, memory proposals, and
            finding drafts are decisions the operator has to see the moment the
            agent produces them. */}
        <div className="mt-4 grid min-w-0 gap-3">
          <div className="grid gap-3">
            <AgentThoughtstream run={activeAgentRun} />
            {(agentTutorialMode || activeAgentRun?.policy.tutorialMode) && (
              <AgentTutorialGuide run={activeAgentRun?.policy.tutorialMode ? activeAgentRun : null} />
            )}
            <AgentMissionGraph run={activeAgentRun} onSteer={steerAgentMission} />
            <AgentCapabilityLedger run={activeAgentRun} onUpdate={updateAgentCapabilities} />
          </div>
          <div className="grid gap-3">
            <div className="min-h-[220px] border border-rule bg-surface/55">
              <div className="flex items-center justify-between border-b border-rule px-3 py-2">
                <span className="rd-eyebrow text-muted">Observation Console</span>
                <div className="flex flex-wrap gap-1">
                  <StatusBadge>{activeAgentRun?.profileId || agentProfileId}</StatusBadge>
                  {activeAgentRun && <StatusBadge>{activeAgentRun.timeline.length} steps</StatusBadge>}
                </div>
              </div>
              <div className="max-h-[300px] overflow-auto p-3" data-testid="agentTimeline">
                {!activeAgentRun && <EmptyState>Prompt AI-First to start a scoped run.</EmptyState>}
                {activeAgentRun?.timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "mb-2 border bg-ink/28 p-3",
                      entry.phase === "failure" || entry.phase === "policy-block"
                        ? "border-rust/45"
                        : entry.phase === "tool-call"
                          ? "border-signal/35"
                          : "border-rule"
                    )}
                    data-testid={`agentTimelineEntry-${entry.id}`}
                    data-component="agentTimelineEntry"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block rd-eyebrow text-muted">
                          {entry.phase || "status"} / {entry.createdAt.slice(11, 19)}Z
                        </span>
                        <p className="mt-1 rd-label text-bone">
                          {timelineEntryText(entry)}
                        </p>
                      </div>
                      <StatusBadge>{entry.toolResult ? (entry.toolResult.ok ? "ok" : "failed") : entry.toolCall?.tool || "note"}</StatusBadge>
                    </div>
                    {entry.note && <p className="mt-2 text-body leading-relaxed text-muted">{entry.note}</p>}
                    {entry.target && (
                      <p className="mt-2 rd-label text-muted">
                        Target: {[entry.target.view, entry.target.evidenceId, entry.target.browserUrl, entry.target.control].filter(Boolean).join(" / ")}
                      </p>
                    )}
                    {entry.toolResult && !entry.toolResult.ok && (
                      <p className="mt-2 border-l border-rust/50 pl-2 text-body leading-relaxed text-rust">
                        {entry.toolResult.error}
                      </p>
                    )}
                    {entry.toolResult?.ok && entry.toolResult.tool === "proposeRunMemory" && (
                      <div className="mt-3 border border-signal/25 bg-signal/[0.06] p-2">
                        <p className="font-display text-body uppercase tracking-data text-bone">
                          {entry.toolResult.data.memory.title}
                        </p>
                        <p className="mt-1 text-meta leading-5 text-muted">{entry.toolResult.data.memory.notes}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="compact"
                            onClick={() => void confirmAgentRunMemoryFromTimeline(entry.id)}
                            data-testid={`agentMemoryConfirm-${entry.id}`}
                          >
                            Confirm Memory
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="compact"
                            onClick={() => void dismissAgentRunMemoryFromTimeline(entry.id)}
                            data-testid={`agentMemoryDismiss-${entry.id}`}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                    {entry.recoveryActions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.recoveryActions.map((action) => (
                          <Button
                            key={action}
                            type="button"
                            variant={action === "stop-run" ? "outline" : "ghost"}
                            size="compact"
                            onClick={() => recoverAgentRun(entry.id, action)}
                            data-testid={`agentRecovery-${action}`}
                            data-component="agentRecoveryAction"
                          >
                            {recoveryActionLabel(action)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-[160px] border border-rule bg-surface/55">
              <div className="flex items-center justify-between border-b border-rule px-3 py-2">
                <span className="rd-eyebrow text-muted">Findings Inbox</span>
                {activeAgentRun && <StatusBadge>{activeAgentRun.findings.length} draft</StatusBadge>}
              </div>
              <div className="max-h-[190px] overflow-auto p-3">
                {!activeAgentRun?.findings.length && <EmptyState>Findings appear after capture inspection.</EmptyState>}
                {activeAgentRun?.findings.map((finding) => (
                  <div key={finding.id} className="mb-2 border border-rule bg-ink/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="font-display text-lead uppercase tracking-data text-bone">
                        {finding.title}
                      </strong>
                      <StatusBadge>{finding.confidence}</StatusBadge>
                    </div>
                    <p className="mt-2 text-body leading-relaxed text-copy">{finding.notes}</p>
                    <p className="mt-2 font-mono text-label text-muted">{finding.evidenceRefs.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="min-h-[180px] border border-rule bg-surface/55">
              <div className="flex items-center justify-between border-b border-rule px-3 py-2">
                <span className="rd-eyebrow text-muted">Run Memory</span>
                <StatusBadge>{agentRunMemory.length} local</StatusBadge>
              </div>
              <div className="grid gap-2 p-3">
                <form className="grid gap-2" onSubmit={submitAgentMemory}>
                  <Input
                    value={agentMemoryTitle}
                    onChange={(event) => onAgentMemoryTitleChange(event.target.value)}
                    placeholder="Hypothesis or retest note title"
                    data-testid="agentMemoryTitle"
                  />
                  <Textarea
                    value={agentMemoryNotes}
                    onChange={(event) => onAgentMemoryNotesChange(event.target.value)}
                    placeholder="What was tested, dismissed, or needs retest?"
                    className="min-h-[62px]"
                    data-testid="agentMemoryNotes"
                  />
                  <Button type="submit" variant="outline" size="compact" data-testid="agentMemoryCreate">
                    <Plus size={12} strokeWidth={1.7} />
                    Remember
                  </Button>
                </form>
                <Input
                  value={agentRunMemorySearch}
                  onChange={(event) => setAgentRunMemorySearch(event.target.value)}
                  placeholder="Search hypotheses, dismissed leads, retest notes"
                  data-testid="agentMemorySearch"
                />
                <div className="max-h-[170px] overflow-auto">
                  {filteredAgentRunMemory.length === 0 && <EmptyState>No local run memory yet.</EmptyState>}
                  {filteredAgentRunMemory.map((entry) => (
                    <div key={entry.id} className="mb-2 border border-rule bg-ink/30 p-3" data-testid={`agentMemory-${entry.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="font-display text-body uppercase tracking-data text-bone">
                          {entry.title}
                        </strong>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge>{entry.kind}</StatusBadge>
                          <StatusBadge>{entry.status}</StatusBadge>
                        </div>
                      </div>
                      <p className="mt-2 text-meta leading-5 text-muted">{entry.notes}</p>
                      {entry.evidenceRefs.length > 0 && (
                        <p className="mt-2 font-mono text-label text-muted">{entry.evidenceRefs.join(", ")}</p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="compact"
                        className="mt-2"
                        onClick={() => void deleteAgentRunMemory(entry.id)}
                        data-testid={`agentMemoryDelete-${entry.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
