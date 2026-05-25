import { Command, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CapturedRequest, ReplayDraft } from "../types";
import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { aiProviderFromValue } from "../lib/aiProvider";
import { resultPreview } from "../lib/resultPreview";
import { cn } from "../lib/utils";
import {
  AI_TASK_META,
  AI_TASK_TYPES,
  DEFAULT_AI_SETTINGS,
  type AiAuditEntry,
  type AiConnectPresetId,
  type AiContextPreview,
  type AiRunResult,
  type AiSettings,
  type AiTaskType
} from "./types";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  captureIds: string[];
  captures: CapturedRequest[];
  targets: string[];
  browserUrl: string;
  onApplyDraft: (draft: ReplayDraft) => void;
  onPrepareNavigate: (url: string) => void;
  onNotice: (message: string) => void;
};

type PaletteStep = "task" | "preview" | "result";

const taskButtonClass = (active: boolean) =>
  cn(
    "grid h-auto gap-1 border border-rule bg-white/[0.02] px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors",
    "hover:border-signal/45 hover:bg-signal/[0.06]",
    active && "border-signal/45 bg-signal/[0.06]"
  );

const palettePanelClass = "grid gap-3";

const paletteMetaClass = "flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-[0.28em] text-dim";

export function CommandPalette({
  open,
  onClose,
  captureIds,
  captures,
  targets,
  browserUrl,
  onApplyDraft,
  onPrepareNavigate,
  onNotice
}: CommandPaletteProps) {
  const [step, setStep] = useState<PaletteStep>("task");
  const [task, setTask] = useState<AiTaskType>("capture_summary");
  const [includeRaw, setIncludeRaw] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [preview, setPreview] = useState<AiContextPreview | null>(null);
  const [result, setResult] = useState<AiRunResult | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  const [connectNote, setConnectNote] = useState("");
  const [error, setError] = useState("");

  const persistSettings = useCallback(async (next: AiSettings) => {
    const saved = (await window.radar?.setAiSettings(next)) || next;
    setSettings(saved);
  }, []);

  const connectPresetAction = useCallback(
    async (presetId: AiConnectPresetId) => {
      if (!window.radar) {
        setError("Run in Electron to connect.");
        return;
      }
      try {
        setError("");
        const next = await window.radar.connectAi(presetId);
        setSettings(next.settings);
        const source =
          next.meta.apiKeySource === "missing"
            ? " — add API key or env var"
            : next.meta.presetId === "codex" && next.meta.apiKeySource === "local"
              ? " · installed Codex auth"
              : ` · key from ${next.meta.apiKeySource}`;
        setConnectNote(`${next.meta.label}: ${next.probe.message}${source}`);
        if (!next.probe.ok) {
          setError(next.probe.message);
          return;
        }
        onNotice(`${next.meta.label} connected`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connect failed");
      }
    },
    [onNotice]
  );

  const buildPreviewAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    try {
      setError("");
      const next = await window.radar.previewAiContext({
        task,
        captureIds,
        includeRaw,
        userPrompt
      });
      setPreview(next);
      setStep("preview");
      if (next.blockedReason) {
        setError(next.blockedReason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }, [captureIds, includeRaw, task, userPrompt]);

  const runTaskAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    if (settings.provider !== "codex-local" && !settings.apiKey.trim()) {
      setError("Set an API key in AI settings.");
      return;
    }
    try {
      setError("");
      await persistSettings(settings);
      const next = await window.radar.runAiTask({
        task,
        captureIds,
        includeRaw,
        userPrompt
      });
      setResult(next);
      setStep("result");
      const items = await window.radar.getAiAudit();
      setAudit(items);
      if (!next.ok) {
        setError(next.error || "AI request failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    }
  }, [includeRaw, persistSettings, captureIds, settings, task, userPrompt]);

  const connectMutation = useAsyncAction(connectPresetAction);
  const previewMutation = useAsyncAction(buildPreviewAction);
  const runMutation = useAsyncAction(runTaskAction);

  const reset = useCallback(() => {
    setStep("task");
    setPreview(null);
    setResult(null);
    setError("");
    setConnectNote("");
  }, []);

  const applyPrepared = useCallback(() => {
    if (!result?.ok || !result.output) {
      return;
    }
    if (result.output.task === "repeater_drafts") {
      const first = result.output.data.drafts[0];
      if (!first) {
        onNotice("No drafts returned.");
        return;
      }
      onApplyDraft(first.draft);
      onNotice(`Loaded draft: ${first.label}`);
      onClose();
      return;
    }
    if (result.output.task === "browser_helper") {
      const navigate = result.output.data.steps.find((stepItem) => stepItem.action === "navigate" && stepItem.url);
      if (!navigate?.url) {
        onNotice("No navigate step to prepare.");
        return;
      }
      onPrepareNavigate(navigate.url);
      onNotice(`Prepared navigation: ${navigate.label}`);
      onClose();
    }
  }, [onApplyDraft, onClose, onNotice, onPrepareNavigate, result]);

  const captureLabel = useMemo(() => {
    if (captureIds.length === 0) {
      return "No capture selected";
    }
    const selected = captures.filter((item) => captureIds.includes(item.id));
    if (selected.length === 1) {
      return `${selected[0].method} ${selected[0].host}${selected[0].path}`;
    }
    return `${selected.length} captures selected`;
  }, [captureIds, captures]);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.radar?.getAiSettings().then((next) => setSettings(next));
    window.radar?.getAiAudit().then((items) => setAudit(items));
  }, [open]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

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

  const actionPending = connectMutation.isPending || previewMutation.isPending || runMutation.isPending;

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-[rgba(4,10,9,0.72)] px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="commandPaletteBackdrop"
      data-component="commandPaletteBackdrop"
    >
      <div
        className="grid max-h-[calc(100vh-5rem)] w-full max-w-5xl gap-4 overflow-auto border border-rule bg-[rgba(7,17,15,0.96)] p-5 font-mono shadow-[0_24px_80px_-20px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
        data-testid="commandPalette"
        data-component="commandPalette"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal">
              <Command size={12} strokeWidth={1.8} /> AI Channel
            </span>
            <h3 className="font-display text-[28px] uppercase tracking-[0.08em] text-bone">Command Palette</h3>
            <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-muted">{captureLabel}</p>
          </div>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={onClose}
            title="Close"
            data-testid="commandPaletteClose"
            data-component="commandPaletteClose"
          >
            <X size={16} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="grid gap-4 [grid-template-columns:minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className={palettePanelClass}>
            <FieldLabel className="px-0 pt-0">Task</FieldLabel>
            <div className="grid gap-2">
              {AI_TASK_TYPES.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  className={taskButtonClass(task === key)}
                  onClick={() => setTask(key)}
                  data-testid={`aiTask-${key}`}
                  data-component="aiTaskButton"
                >
                  <strong className="tracking-[0.22em] text-bone">{AI_TASK_META[key].label}</strong>
                  <span className="text-dim tracking-[0.14em] leading-[1.4]">{AI_TASK_META[key].hint}</span>
                </Button>
              ))}
            </div>

            <FieldLabel className="px-0" htmlFor="ai-user-prompt">
              Operator note
            </FieldLabel>
            <Textarea
              id="ai-user-prompt"
              variant="bare"
              className="min-h-[72px]"
              value={userPrompt}
              onChange={(event) => setUserPrompt(event.target.value)}
              spellCheck={false}
              placeholder="Optional focus for this run"
              data-testid="aiUserPrompt"
              data-component="aiUserPrompt"
            />

            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <input
                type="checkbox"
                checked={includeRaw}
                onChange={(event) => setIncludeRaw(event.target.checked)}
                data-testid="aiIncludeRaw"
                data-component="aiIncludeRaw"
              />
              <ShieldAlert size={13} strokeWidth={1.7} />
              Send raw headers and bodies (explicit)
            </label>
          </section>

          <section className={palettePanelClass}>
            <FieldLabel className="px-0 pt-0">Connect</FieldLabel>
            <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => connectMutation.run("codex")}
                data-testid="aiConnectCodex"
                data-component="aiConnectButton"
              >
                Codex Connect
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => connectMutation.run("cursor_cli")}
                data-testid="aiConnectCursorCli"
                data-component="aiConnectButton"
              >
                Cursor CLI Connect
              </Button>
            </div>
            {connectNote && (
              <p className="font-mono text-[9px] uppercase leading-[1.5] tracking-[0.2em] text-dim">
                {connectNote}
              </p>
            )}

            <FieldLabel className="px-0">Provider</FieldLabel>
            <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
              <Select
                variant="compact"
                value={settings.provider}
                onChange={(event) => {
                  const provider = aiProviderFromValue(event.target.value);
                  if (provider) {
                    setSettings({ ...settings, provider });
                  }
                }}
                data-testid="aiProvider"
                data-component="aiProvider"
              >
                <option value="openai">OpenAI</option>
                <option value="codex-local">Codex app</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </Select>
              <Input
                variant="compact"
                className="uppercase tracking-[0.12em]"
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                spellCheck={false}
                placeholder="model"
                data-testid="aiModel"
                data-component="aiModel"
              />
            </div>
            {settings.provider === "codex-local" ? (
              <p
                className="border border-signal/25 bg-[linear-gradient(135deg,rgba(255,87,51,0.08),transparent_42%),rgba(255,255,255,0.02)] px-3 py-2 font-mono text-[9px] uppercase leading-[1.6] tracking-[0.2em] text-muted"
                data-testid="aiLocalCodexNote"
                data-component="aiLocalCodexNote"
              >
                Uses your installed Codex app login; no API key is stored in Radar.
              </p>
            ) : (
              <Input
                variant="compact"
                className="uppercase tracking-[0.12em]"
                type="password"
                value={settings.apiKey}
                onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                placeholder="API key"
                spellCheck={false}
                data-testid="aiApiKey"
                data-component="aiApiKey"
              />
            )}
            {settings.provider === "openai-compatible" && (
              <Input
                variant="compact"
                className="uppercase tracking-[0.12em]"
                value={settings.baseUrl}
                onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                spellCheck={false}
                placeholder="http://127.0.0.1:11434/v1"
                data-testid="aiBaseUrl"
                data-component="aiBaseUrl"
              />
            )}

            <div className={paletteMetaClass}>
              <span>Scope: {targets.length} origins</span>
              <span>Browser: {browserUrl || "—"}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => previewMutation.run()}
                disabled={actionPending}
                data-testid="aiPreviewContext"
                data-component="aiPreviewContext"
              >
                {previewMutation.isPending ? (
                  <Loader2 size={14} className="animate-[spin_0.9s_linear_infinite]" />
                ) : (
                  <Sparkles size={14} />
                )}
                Preview context
              </Button>
              <Button
                type="button"
                variant="solid"
                onClick={() => runMutation.run()}
                disabled={actionPending}
                data-testid="aiRunTask"
                data-component="aiRunTask"
              >
                {runMutation.isPending ? (
                  <Loader2 size={14} className="animate-[spin_0.9s_linear_infinite]" />
                ) : (
                  <Command size={14} />
                )}
                Run task
              </Button>
            </div>

            {error && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-rust">{error}</p>}
          </section>
        </div>

        {step === "preview" && preview && (
          <section className="grid gap-2 border-t border-rule pt-4" data-testid="aiContextPreview" data-component="aiContextPreview">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
              <strong>Context preview</strong>
              <span>
                {preview.captureCount} captures · {preview.charCount} chars ·{" "}
                {preview.redacted ? "redacted" : "raw"}
              </span>
            </div>
            <pre className="max-h-64 overflow-auto border border-rule bg-black/20 p-3 text-[11px] leading-[1.5] text-bone">
              {preview.previewText}
            </pre>
          </section>
        )}

        {step === "result" && result && (
          <section className="grid gap-2 border-t border-rule pt-4" data-testid="aiResult" data-component="aiResult">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
              <strong>Result</strong>
              <span>audit {result.auditId}</span>
            </div>
            <pre className="max-h-64 overflow-auto border border-rule bg-black/20 p-3 text-[11px] leading-[1.5] text-bone">
              {resultPreview(result)}
            </pre>
            {(result.output?.task === "repeater_drafts" || result.output?.task === "browser_helper") && (
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
          <section className="ai-audit" data-testid="aiAudit" data-component="aiAudit">
            <FieldLabel className="px-0">Session audit</FieldLabel>
            <div className="grid gap-2">
              {audit.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "grid gap-1 border border-rule px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-dim",
                    !entry.ok && "border-rust/45"
                  )}
                >
                  <strong className="tracking-[0.24em] text-bone">{entry.task}</strong>
                  <span>
                    {entry.provider} · {entry.model} · {entry.redacted ? "redacted" : "raw"} · {entry.promptChars}c
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
