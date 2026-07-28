import { Bot } from "lucide-react";
import type { ScopeDomain } from "../../hooks/workbench/useScopeDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export type ScopeViewProps = Pick<ScopeDomain, "targetText" | "setTargetText"> &
  Pick<WorkbenchShellDomain, "setAiPaletteOpen">;

export function ScopeView({ targetText, setTargetText, setAiPaletteOpen }: ScopeViewProps) {
  return (
    <div className="grid min-h-0 gap-4 overflow-auto p-5 [grid-template-rows:minmax(0,1fr)_auto]">
      <Textarea
        variant="bare"
        className="h-full min-h-[280px]"
        value={targetText}
        onChange={(event) => setTargetText(event.target.value)}
        spellCheck={false}
        placeholder="https://your-target.example"
        data-testid="scopeTargetList"
        data-component="scopeTargetList"
      />
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full justify-start border-dashed border-signal/30 bg-signal/5 px-4 py-3 rd-banner text-muted hover:border-signal/55 hover:bg-signal/10 hover:text-bone [&_svg]:text-signal"
        onClick={() => setAiPaletteOpen(true)}
        data-testid="scopeOpenAiPalette"
        data-component="scopeOpenAiPalette"
      >
        <Bot size={15} strokeWidth={1.7} />
        <span>AI command palette — ⌘K</span>
      </Button>
    </div>
  );
}
