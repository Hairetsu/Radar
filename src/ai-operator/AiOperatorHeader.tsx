import { Bot, Focus, ListTree, PanelRight, Settings2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { StatusBadge, StatusDot } from "../components/radar/primitives";
import type { AiOperatorController } from "./useAiOperator";

export function AiOperatorHeader({
  controller,
  onToggleRail,
  onToggleInspector
}: {
  controller: AiOperatorController;
  onToggleRail: () => void;
  onToggleInspector: () => void;
}) {
  const context = controller.workspaceContext;
  return (
    <header
      className="relative z-40 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-rule bg-ink/85 px-4 py-3 backdrop-blur-xl"
      data-testid="aiOperatorHeader"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center border border-signal/50 bg-signal/10 text-signal shadow-[0_0_32px_-18px_var(--color-signal)]">
          <Bot size={19} strokeWidth={1.6} />
          {controller.runningRun && <span className="absolute inset-1 animate-[ping_1.8s_ease-out_infinite] border border-signal/30" />}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="rd-eyebrow shrink-0 text-signal">Radar</span>
            <h1 className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-title font-semibold uppercase leading-none text-bone [font-stretch:75%]">
              AI Operator
            </h1>
          </div>
          <p className="mt-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
            {context?.project?.name || controller.localContext?.profile.name || "Workspace unavailable"}
            {context?.session?.name ? ` / ${context.session.name}` : ""}
            {context ? ` / ${context.activeView}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1.5 min-[900px]:flex">
          <StatusDot tone={context ? "good" : "danger"} />
          <StatusBadge tone={controller.mode === "ai-first" ? "move" : "ghost"}>{controller.mode}</StatusBadge>
          <StatusBadge tone={controller.connection.connected ? "good" : "warn"}>
            {controller.connection.connected ? controller.connection.model || "connected" : "AI offline"}
          </StatusBadge>
        </div>
        <Button type="button" variant="ghost" size="compact" className="max-[820px]:inline-flex min-[820px]:hidden" onClick={onToggleRail} aria-label="Toggle run history" data-testid="toggleAiRunRail">
          <ListTree size={13} />
        </Button>
        <Button type="button" variant="ghost" size="compact" className="max-[940px]:inline-flex min-[940px]:hidden" onClick={onToggleInspector} aria-label="Toggle mission inspector" data-testid="toggleAiInspector">
          <PanelRight size={13} />
        </Button>
        <Button
          type="button"
          variant={controller.section === "settings" ? "solid" : "ghost"}
          size="compact"
          onClick={() => controller.setSection(controller.section === "settings" ? "runs" : "settings")}
          data-testid="aiOperatorSettings"
        >
          <Settings2 size={13} />
          <span className="max-[680px]:hidden">Connection</span>
        </Button>
        <Button type="button" variant="outline" size="compact" onClick={() => void window.radarOperator?.focusWorkspace()} data-testid="focusWorkspace">
          <Focus size={13} />
          <span className="max-[680px]:hidden">Workspace</span>
        </Button>
      </div>
    </header>
  );
}
