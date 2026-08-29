import { Ban, KeyRound, Pause, Play, RotateCw, Send, Square, UserRound, X } from "lucide-react";
import type { FormEvent } from "react";
import { defaultAssessmentContract } from "../../shared/agentAssessment.js";
import type { AgentRunProfileId } from "../../shared/agent-types.js";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { StatusBadge } from "../components/radar/primitives";
import { cn } from "../lib";
import type { AiOperatorController } from "./useAiOperator";

function AssessmentContractDeck({
  profileId,
  families,
  remaining
}: {
  profileId: AgentRunProfileId;
  families?: string[];
  remaining?: number;
}) {
  if (profileId !== "autonomous-assessment") {
    return null;
  }
  const contract = defaultAssessmentContract();
  return (
    <div className="grid gap-1 border border-rule/80 bg-ink/40 px-3 py-2" data-testid="assessmentContractDeck">
      <span className="rd-eyebrow text-muted">Continuous assessment</span>
      <p className="font-mono text-micro text-copy">
        {contract.authorityLevel} · {(families || contract.families).join(" · ")} · 1 concurrent · raw off
      </p>
      <p className="font-mono text-micro text-muted">
        {remaining ?? contract.maxProbeRequests} probe requests remaining · {contract.delayMs}ms delay · {Math.round(contract.maxRuntimeMs / 60_000)}m runtime
      </p>
      <p className="font-mono text-micro text-signal">One start · no approval pauses · stops on first supported result</p>
    </div>
  );
}

export function AgentComposer({ controller }: { controller: AiOperatorController }) {
  const run = controller.activeRun;
  const canSteer = Boolean(run && (run.status === "paused" || run.status === "failed"));
  const isLiveRun = Boolean(run && (run.status === "running" || run.status === "queued"));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSteer && controller.goal.trim()) {
      void controller.steerMission({ action: "add-objective", title: controller.goal.trim(), priority: 3 });
      controller.setGoal("");
      return;
    }
    void controller.startRun();
  };

  const lifecycleControls = (
    <>
      <Button
        type="button"
        variant={isLiveRun ? "solid" : "outline"}
        size="compact"
        disabled={!controller.canPause || controller.pending}
        onClick={() => void controller.pauseRun()}
        title={isLiveRun ? "Pause after the current tool settles, then update the mission direction." : "Pause the active mission."}
        aria-label={isLiveRun ? "Pause run and open mission steering" : "Pause run"}
        data-testid="pauseAgentRun"
      >
        <Pause size={12} /> {isLiveRun ? "Pause & Steer" : "Pause"}
      </Button>
      <Button type="button" variant="outline" size="compact" disabled={!controller.canResume || controller.pending} onClick={() => void controller.resumeRun()} data-testid="resumeAgentRun">
        {controller.capabilityReviewRequired ? <KeyRound size={12} /> : <Play size={12} />}
        {controller.capabilityReviewRequired
          ? "Approve Lease First"
          : run?.policy.tutorialMode
            ? "Continue Lesson"
            : "Resume"}
      </Button>
      {controller.canContinue && <Button type="button" variant="outline" size="compact" disabled={controller.pending} onClick={() => void controller.continueRun()} data-testid="continueAgentRun"><RotateCw size={12} /> Continue New</Button>}
      {isLiveRun && <Button type="button" variant="outline" size="compact" disabled={controller.pending} onClick={() => void controller.stopTraffic()} data-testid="stopAgentTraffic"><Ban size={12} /> Stop Traffic Now</Button>}
      <Button type="button" variant="ghost" size="compact" disabled={!controller.canStop || controller.pending} onClick={() => void controller.stopRun()} data-testid="stopAgentRun"><Square size={12} /> Stop</Button>
      {controller.mode === "ai-first" && <Button type="button" variant="ghost" size="compact" disabled={controller.pending} onClick={() => void controller.returnToManual()} data-testid="returnToManual"><UserRound size={12} /> Manual</Button>}
    </>
  );

  if (isLiveRun && run) {
    return (
      <div className="border-t border-rule bg-ink/92 px-3 py-2.5 backdrop-blur-xl" data-testid="aiOperatorComposer" data-state="live">
        <div className="mx-auto grid max-w-[1100px] gap-2" data-testid="aiOperatorActiveControls">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-[240px] flex-1">
              <span className="rd-eyebrow text-signal">{run.profileId === "autonomous-assessment" ? "Autonomous loop live" : "Live bounded mission"}</span>
              <p className="mt-1 truncate text-meta text-copy" title={run.goal}>{run.goal}</p>
              <p className="mt-1 font-mono text-micro text-muted">Need to redirect it? Pause &amp; Steer adds reviewed direction without rewriting the original goal.</p>
            </div>
            <div className="flex max-w-full flex-wrap justify-end gap-1">{controller.budgetLabels.slice(0, 4).map((label) => <StatusBadge key={label}>{label}</StatusBadge>)}</div>
          </div>
          <AssessmentContractDeck
            profileId={run.profileId}
            families={run.assessment?.contract.families}
            remaining={Math.max(0, (run.policy.maxProbeRequests ?? 0) - (run.checkpoint?.probeRequestCount ?? run.assessment?.ledger.consumed ?? 0))}
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-rule/70 pt-2">
            <div className="flex min-w-0 items-center gap-3 font-mono text-label text-muted" role="status">
              <span className="h-1.5 w-1.5 shrink-0 animate-[stream-glow_1.5s_ease-in-out_infinite] rounded-full bg-signal" />
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{controller.notice}</span>
              <span className="shrink-0 uppercase text-signal">{run.status}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">{lifecycleControls}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-rule bg-ink/92 p-3 backdrop-blur-xl" data-testid="aiOperatorComposer" data-state={canSteer ? "steering" : "compose"}>
      <form className="mx-auto grid max-w-[860px] gap-2" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rd-eyebrow text-signal">{canSteer ? "Update mission direction" : "Bounded mission goal"}</span>
          <div className="flex flex-wrap gap-1">{controller.budgetLabels.slice(0, 4).map((label) => <StatusBadge key={label}>{label}</StatusBadge>)}</div>
        </div>
        <Textarea
          value={controller.goal}
          onChange={(event) => controller.setGoal(event.target.value)}
          placeholder={
            canSteer
              ? "Tell the agent what to prioritize, avoid, or investigate next. The original goal stays in the audit trail."
              : controller.followUp
                ? "What should Radar do with this finding next? Verify, expand, or retest it."
                : "Inspect https://target.test for authorization, session, and API hardening issues."
          }
          className="min-h-[76px] resize-none"
          autoFocus={!run}
          disabled={Boolean(controller.runningRun) && !canSteer}
          data-testid="agentGoalInput"
        />
        {controller.followUp && (
          <div className="flex min-w-0 items-center justify-between gap-2 border border-signal/40 bg-signal/10 px-3 py-2" data-testid="findingFollowUpChip">
            <div className="min-w-0">
              <span className="rd-eyebrow text-signal">Based on finding</span>
              <p className="truncate font-mono text-micro text-copy" title={controller.followUp.title}>{controller.followUp.title}</p>
            </div>
            <Button type="button" variant="ghost" size="compact" onClick={() => controller.clearFollowUp()} aria-label="Clear finding follow-up" data-testid="clearFindingFollowUp">
              <X size={12} />
            </Button>
          </div>
        )}
        <AssessmentContractDeck profileId={controller.profileId} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-[1200px]:grid-cols-[minmax(200px,0.7fr)_auto_minmax(0,1fr)]">
          <Select variant="compact" value={controller.profileId} onChange={(event) => controller.setProfileId(event.target.value as AgentRunProfileId)} disabled={Boolean(controller.runningRun) || canSteer} data-testid="agentProfileSelect">
            {controller.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
          </Select>
          <button
            type="button"
            role="switch"
            aria-checked={controller.tutorialMode}
            disabled={Boolean(controller.runningRun) || canSteer}
            onClick={() => controller.setTutorialMode(!controller.tutorialMode)}
            className={cn("flex h-9 items-center gap-2 border px-3 rd-label transition", controller.tutorialMode ? "border-signal/50 bg-signal/10 text-signal" : "border-rule text-muted hover:text-bone")}
            data-testid="agentTutorialToggle"
          >
            <span className={cn("h-2 w-2 border border-current", controller.tutorialMode && "bg-signal")} /> Tutorial
          </button>
          <div className="col-span-2 flex min-w-0 flex-wrap justify-start gap-1.5 min-[1200px]:col-span-1 min-[1200px]:justify-end">
            {!controller.runningRun && !canSteer && (
              <Button type="submit" variant="solid" disabled={controller.pending} data-testid="startAgentRun">
                <Play size={13} />
                {controller.tutorialMode
                  ? "Start Tutorial"
                  : controller.profileId === "autonomous-assessment"
                    ? "Start Autonomous"
                    : "Start Run"}
              </Button>
            )}
            {canSteer && <Button type="submit" variant="solid" disabled={controller.pending || !controller.goal.trim()} data-testid="steerAgentRun"><Send size={13} /> Add Direction</Button>}
            {lifecycleControls}
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 font-mono text-label text-muted" role="status">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{controller.notice}</span>
          <span className="shrink-0 uppercase">{run?.status || controller.mode}</span>
        </div>
      </form>
    </div>
  );
}
