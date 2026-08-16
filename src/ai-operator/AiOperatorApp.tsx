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

const TASK_RAIL_COMPACT_WIDTH = 960;

function compactTaskRailViewport() {
  return typeof window === "undefined" || window.innerWidth < TASK_RAIL_COMPACT_WIDTH;
}

function savedDesktopTaskRailOpen() {
  try {
    return window.localStorage.getItem("radar.ai-operator.task-rail") !== "collapsed";
  } catch {
    return true;
  }
}

export function AiOperatorApp() {
  useTheme();
  const controller = useAiOperator();
  const [railOpen, setRailOpen] = useState(() => {
    if (compactTaskRailViewport()) return false;
    return savedDesktopTaskRailOpen();
  });
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    if (controller.section !== "settings") return;
    setInspectorOpen(false);
  }, [controller.section]);

  useEffect(() => {
    if (compactTaskRailViewport()) return;
    try {
      window.localStorage.setItem("radar.ai-operator.task-rail", railOpen ? "expanded" : "collapsed");
    } catch {
      // Sidebar preference is best effort and contains no assessment data.
    }
  }, [railOpen]);

  useEffect(() => {
    let compact = compactTaskRailViewport();
    const syncTaskRailToViewport = () => {
      const nextCompact = compactTaskRailViewport();
      if (nextCompact === compact) return;
      compact = nextCompact;
      setRailOpen(nextCompact ? false : savedDesktopTaskRailOpen());
    };
    window.addEventListener("resize", syncTaskRailToViewport);
    return () => window.removeEventListener("resize", syncTaskRailToViewport);
  }, []);

  const closeMobileRail = () => {
    if (compactTaskRailViewport()) setRailOpen(false);
  };

  return (
    <main className="radar-shell relative grid h-full min-h-0 overflow-hidden bg-ink text-copy [grid-template-rows:auto_minmax(0,1fr)]" data-testid="aiOperatorShell" data-component="aiOperatorShell">
      <div className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] radar-drift [inset:-10vmax]" />
      <div className="relative z-[2] contents">
        <AiOperatorHeader
          controller={controller}
          railOpen={controller.section !== "settings" && railOpen}
          inspectorOpen={inspectorOpen}
          onToggleRail={() => {
            if (controller.section === "settings") {
              controller.setSection("runs");
              setRailOpen(true);
              setInspectorOpen(false);
              return;
            }
            setRailOpen((open) => !open);
            setInspectorOpen(false);
          }}
          onToggleInspector={() => {
            if (controller.section === "settings") {
              controller.setSection("runs");
              setInspectorOpen(true);
              if (compactTaskRailViewport()) setRailOpen(false);
              return;
            }
            setInspectorOpen((open) => !open);
            if (compactTaskRailViewport()) setRailOpen(false);
          }}
        />
        {controller.section === "settings" ? (
          <AiConnectionPanel controller={controller} />
        ) : (
          <section className="relative grid min-h-0 min-w-0 [grid-template-columns:auto_minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)_auto]" data-testid="aiOperatorWorkspace">
            <AgentRunRail
              controller={controller}
              collapsed={!railOpen}
              onToggle={() => setRailOpen((open) => !open)}
              onNavigate={closeMobileRail}
              className={railOpen ? "[grid-column:1/2] [grid-row:1/3] transition-[width] duration-300 max-[959px]:fixed max-[959px]:bottom-0 max-[959px]:left-0 max-[959px]:top-[65px] max-[959px]:z-30 max-[959px]:w-[min(320px,88vw)] max-[959px]:shadow-bureau" : "[grid-column:1/2] [grid-row:1/3] transition-[width] duration-300 max-[959px]:hidden"}
            />
            <div className="grid min-h-0 min-w-0 [grid-column:2/3] [grid-row:1/2]">
              <AgentFeed controller={controller} />
            </div>
            <div className="min-w-0 [grid-column:2/3] [grid-row:2/3]">
              <AgentComposer controller={controller} />
            </div>
            {railOpen && (
              <button type="button" className="fixed inset-x-0 bottom-0 top-[65px] z-20 bg-ink/65 backdrop-blur-[2px] min-[960px]:hidden" aria-label="Close task history" onClick={() => setRailOpen(false)} />
            )}
            {inspectorOpen && (
              <button
                type="button"
                className="fixed inset-x-0 bottom-0 top-[65px] z-20 bg-ink/65 backdrop-blur-[2px]"
                aria-label="Close AI Operator panels"
                onClick={() => {
                  setInspectorOpen(false);
                }}
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
