import { Pause, Play, RotateCw, Send, Square, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { StatusBadge } from "../components/radar/primitives";
import { cn } from "../lib";
import type { AgentRunProfileId } from "../../shared/agent-types.js";
import type { AiOperatorController } from "./useAiOperator";

export function AgentComposer({ controller }: { controller: AiOperatorController }) {
  const run = controller.activeRun;
  const canSteer = Boolean(run && (run.status === "paused" || run.status === "failed"));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSteer && controller.goal.trim()) {
      void controller.steerMission({ action: "add-objective", title: controller.goal.trim(), priority: 3 });
      controller.setGoal("");
      return;
    }
    void controller.startRun();
  };

  return (
    <div className="border-t border-rule bg-ink/92 p-3 backdrop-blur-xl" data-testid="aiOperatorComposer">
      <form className="mx-auto grid max-w-[860px] gap-2" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rd-eyebrow text-signal">{canSteer ? "Steer paused mission" : "Bounded mission goal"}</span>
          <div className="flex flex-wrap gap-1">{controller.budgetLabels.slice(0, 4).map((label) => <StatusBadge key={label}>{label}</StatusBadge>)}</div>
        </div>
        <Textarea
          value={controller.goal}
          onChange={(event) => controller.setGoal(event.target.value)}
          placeholder={canSteer ? "Add a reviewed objective to this paused Mission Graph." : "Inspect https://target.test for authorization, session, and API hardening issues."}
          className="min-h-[76px] resize-none"
          autoFocus={!run}
          disabled={Boolean(controller.runningRun) && !canSteer}
          data-testid="agentGoalInput"
        />
        <div className="grid gap-2 min-[720px]:grid-cols-[minmax(180px,0.8fr)_auto] min-[1200px]:grid-cols-[minmax(180px,0.8fr)_auto_minmax(0,1fr)]">
          <Select value={controller.profileId} onChange={(event) => controller.setProfileId(event.target.value as AgentRunProfileId)} disabled={Boolean(controller.runningRun) || canSteer} data-testid="agentProfileSelect">
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
          <div className="flex flex-wrap justify-end gap-1.5 min-[720px]:col-span-2 min-[1200px]:col-span-1">
            {!controller.runningRun && !canSteer && <Button type="submit" variant="solid" disabled={controller.pending} data-testid="startAgentRun"><Play size={13} /> {controller.tutorialMode ? "Start Tutorial" : "Start Run"}</Button>}
            {canSteer && <Button type="submit" variant="solid" disabled={controller.pending || !controller.goal.trim()} data-testid="steerAgentRun"><Send size={13} /> Add Objective</Button>}
            <Button type="button" variant="outline" size="compact" disabled={!controller.canPause || controller.pending} onClick={() => void controller.pauseRun()} data-testid="pauseAgentRun"><Pause size={12} /> Pause</Button>
            <Button type="button" variant="outline" size="compact" disabled={!controller.canResume || controller.pending} onClick={() => void controller.resumeRun()} data-testid="resumeAgentRun"><Play size={12} /> {run?.policy.tutorialMode ? "Continue Lesson" : "Resume"}</Button>
            {controller.canContinue && <Button type="button" variant="outline" size="compact" disabled={controller.pending} onClick={() => void controller.continueRun()} data-testid="continueAgentRun"><RotateCw size={12} /> Continue New</Button>}
            <Button type="button" variant="ghost" size="compact" disabled={!controller.canStop || controller.pending} onClick={() => void controller.stopRun()} data-testid="stopAgentRun"><Square size={12} /> Stop</Button>
            {controller.mode === "ai-first" && <Button type="button" variant="ghost" size="compact" disabled={controller.pending} onClick={() => void controller.returnToManual()} data-testid="returnToManual"><UserRound size={12} /> Manual</Button>}
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
