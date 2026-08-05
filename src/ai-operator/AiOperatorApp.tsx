import { useEffect, useState } from "react";
import { AiConnectionPanel } from "./AiConnectionPanel";
import { AgentCapabilityPrompt } from "./AgentCapabilityPrompt";
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

  useEffect(() => {
    if (controller.section !== "settings") return;
    setRailOpen(false);
    setInspectorOpen(false);
  }, [controller.section]);

  return (
    <main className="radar-shell relative grid h-full min-h-0 overflow-hidden bg-ink text-copy [grid-template-rows:auto_minmax(0,1fr)]" data-testid="aiOperatorShell" data-component="aiOperatorShell">
      <div className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] radar-drift [inset:-10vmax]" />
      <div className="relative z-[2] contents">
        <AiOperatorHeader
          controller={controller}
          railOpen={railOpen}
          inspectorOpen={inspectorOpen}
          onToggleRail={() => {
            setRailOpen((open) => !open);
            setInspectorOpen(false);
          }}
          onToggleInspector={() => {
            setInspectorOpen((open) => !open);
            setRailOpen(false);
          }}
        />
        {controller.section === "settings" ? (
          <AiConnectionPanel controller={controller} />
        ) : (
          <section className="relative grid min-h-0 min-w-0 [grid-template-columns:minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)_auto]" data-testid="aiOperatorWorkspace">
            <div className="grid min-h-0 min-w-0 [grid-column:1/2] [grid-row:1/2]">
              <AgentFeed controller={controller} />
            </div>
            <div className="min-w-0 [grid-column:1/2] [grid-row:2/3]">
              <AgentComposer controller={controller} />
            </div>
            {(railOpen || inspectorOpen) && (
              <button
                type="button"
                className="fixed inset-x-0 bottom-0 top-[65px] z-20 bg-ink/65 backdrop-blur-[2px]"
                aria-label="Close AI Operator panels"
                onClick={() => {
                  setRailOpen(false);
                  setInspectorOpen(false);
                }}
              />
            )}
            {railOpen && (
              <AgentRunRail
                controller={controller}
                className="radar-reveal fixed bottom-0 left-0 top-[65px] z-30 w-[min(340px,88vw)] opacity-0 shadow-bureau animate-[panel-enter-left_260ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]"
              />
            )}
            {inspectorOpen && (
              <AgentInspector
                controller={controller}
                className="radar-reveal fixed bottom-0 right-0 top-[65px] z-30 w-[min(460px,92vw)] opacity-0 shadow-bureau animate-[panel-enter-right_260ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]"
              />
            )}
          </section>
        )}
      </div>
      <AgentCapabilityPrompt controller={controller} />
    </main>
  );
}
