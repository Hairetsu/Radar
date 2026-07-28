import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { resultPreview } from "../lib/resultPreview";
import { cn } from "../lib/utils";
import type { useCommandPaletteController } from "./useCommandPaletteController";

type CommandPaletteController = ReturnType<
  typeof useCommandPaletteController
>;

export function CommandPaletteOutput({
  controller
}: {
  controller: CommandPaletteController;
}) {
  const { step, preview, result, audit, applyPrepared } = controller;
  return (
    <>
      {step === "preview" && preview && (
        <section
          className="grid gap-2 border-t border-rule pt-4"
          data-testid="aiContextPreview"
          data-component="aiContextPreview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rd-eyebrow text-muted">
            <strong>Context preview</strong>
            <span>
              {preview.captureCount +
                (preview.webSocketEventCount || 0)}{" "}
              packets · {preview.charCount} chars ·{" "}
              {preview.redacted ? "redacted" : "raw"}
            </span>
          </div>
          <pre className="max-h-64 overflow-auto border border-rule radar-panel p-3 text-meta leading-[1.5]">
            {preview.previewText}
          </pre>
        </section>
      )}

      {step === "result" && result && (
        <section
          className="grid gap-2 border-t border-rule pt-4"
          data-testid="aiResult"
          data-component="aiResult"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rd-eyebrow text-muted">
            <strong>Result</strong>
            <span>audit {result.auditId}</span>
          </div>
          <pre className="max-h-64 overflow-auto border border-rule radar-panel p-3 text-meta leading-[1.5]">
            {resultPreview(result)}
          </pre>
          {(result.output?.task === "repeater_drafts" ||
            result.output?.task === "browser_helper") && (
            <Button
              type="button"
              variant="solid"
              size="compact"
              onClick={applyPrepared}
              data-testid="aiApplyPrepared"
              data-component="aiApplyPrepared"
            >
              Apply prepared action
            </Button>
          )}
        </section>
      )}

      {audit.length > 0 && (
        <section
          className="ai-audit"
          data-testid="aiAudit"
          data-component="aiAudit"
        >
          <FieldLabel className="px-0">Session audit</FieldLabel>
          <div className="grid gap-2">
            {audit.slice(0, 6).map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "grid gap-1 border border-rule px-3 py-2 rd-label text-dim",
                  !entry.ok && "border-rust/45"
                )}
              >
                <strong className="tracking-eyebrow text-bone">
                  {entry.skillId
                    ? `custom:${entry.skillId}`
                    : entry.task}
                </strong>
                <span>
                  {entry.provider} · {entry.model} ·{" "}
                  {entry.redacted ? "redacted" : "raw"} ·{" "}
                  {entry.promptChars}c
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
