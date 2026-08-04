import { useState } from "react";
import { cn } from "../lib";
import { AiConnectionPanel } from "./AiConnectionPanel";
import { AiOperatorHeader } from "./AiOperatorHeader";
import { AgentComposer } from "./AgentComposer";
import { AgentFeed } from "./AgentFeed";
import { AgentInspector } from "./AgentInspector";
import { AgentRunRail } from "./AgentRunRail";
import { useAiOperator } from "./useAiOperator";
import { useTheme } from "../hooks/useTheme";

export function AiOperatorApp() {
  useTheme();
  const controller = useAiOperator();
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <main className="radar-shell relative grid h-full min-h-0 overflow-hidden bg-ink text-copy [grid-template-rows:auto_minmax(0,1fr)]" data-testid="aiOperatorShell" data-component="aiOperatorShell">
      <div className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] radar-drift [inset:-10vmax]" />
      <div className="relative z-[2] contents">
        <AiOperatorHeader controller={controller} onToggleRail={() => setRailOpen((open) => !open)} onToggleInspector={() => setInspectorOpen((open) => !open)} />
        {controller.section === "settings" ? (
          <AiConnectionPanel controller={controller} />
        ) : (
          <section className="relative grid min-h-0 min-w-0 [grid-template-columns:232px_minmax(0,1fr)_310px] [grid-template-rows:minmax(0,1fr)_auto] max-[940px]:[grid-template-columns:232px_minmax(0,1fr)] max-[820px]:[grid-template-columns:minmax(0,1fr)]" data-testid="aiOperatorWorkspace">
            <AgentRunRail controller={controller} className={cn("[grid-column:1/2] [grid-row:1/3] max-[820px]:fixed max-[820px]:bottom-0 max-[820px]:left-0 max-[820px]:top-[65px] max-[820px]:z-30 max-[820px]:w-[min(300px,86vw)] max-[820px]:shadow-bureau", !railOpen && "max-[820px]:hidden")} />
            <div className="grid min-h-0 min-w-0 [grid-column:2/3] [grid-row:1/2] max-[820px]:[grid-column:1/2]">
              <AgentFeed controller={controller} />
            </div>
            <AgentInspector controller={controller} className={cn("[grid-column:3/4] [grid-row:1/3] max-[940px]:fixed max-[940px]:bottom-0 max-[940px]:right-0 max-[940px]:top-[65px] max-[940px]:z-30 max-[940px]:w-[min(420px,92vw)] max-[940px]:shadow-bureau", !inspectorOpen && "max-[940px]:hidden")} />
            <div className="min-w-0 [grid-column:2/3] [grid-row:2/3] max-[820px]:[grid-column:1/2]">
              <AgentComposer controller={controller} />
            </div>
            {(railOpen || inspectorOpen) && <button type="button" className="fixed inset-0 z-20 bg-ink/65 min-[940px]:hidden" aria-label="Close AI Operator panels" onClick={() => { setRailOpen(false); setInspectorOpen(false); }} />}
          </section>
        )}
      </div>
    </main>
  );
}
