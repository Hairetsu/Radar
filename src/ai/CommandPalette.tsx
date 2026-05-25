import { Command, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CapturedRequest, ReplayDraft } from "../types";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { aiProviderFromValue } from "../lib/aiProvider";
import { resultPreview } from "../lib/resultPreview";
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
    if (!settings.apiKey.trim()) {
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
      className="ai-palette-backdrop"
      onClick={onClose}
      data-testid="commandPaletteBackdrop"
      data-component="commandPaletteBackdrop"
    >
      <div
        className="ai-palette"
        onClick={(event) => event.stopPropagation()}
        data-testid="commandPalette"
        data-component="commandPalette"
      >
        <header className="ai-palette-head">
          <div>
            <span className="eyebrow">
              <Command size={12} strokeWidth={1.8} /> AI Channel
            </span>
            <h3>Command Palette</h3>
            <p>{captureLabel}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="Close"
            data-testid="commandPaletteClose"
            data-component="commandPaletteClose"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="ai-palette-grid">
          <section className="ai-panel">
            <label className="field-label">Task</label>
            <div className="ai-task-list">
              {AI_TASK_TYPES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={task === key ? "active" : ""}
                  onClick={() => setTask(key)}
                  data-testid={`aiTask-${key}`}
                  data-component="aiTaskButton"
                >
                  <strong>{AI_TASK_META[key].label}</strong>
                  <span>{AI_TASK_META[key].hint}</span>
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="ai-user-prompt">
              Operator note
            </label>
            <textarea
              id="ai-user-prompt"
              className="code-area ai-note"
              value={userPrompt}
              onChange={(event) => setUserPrompt(event.target.value)}
              spellCheck={false}
              placeholder="Optional focus for this run"
              data-testid="aiUserPrompt"
              data-component="aiUserPrompt"
            />

            <label className="ai-raw-toggle">
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

          <section className="ai-panel">
            <label className="field-label">Connect</label>
            <div className="ai-connect-row">
              <button
                type="button"
                className="line-button"
                disabled={actionPending}
                onClick={() => connectMutation.run("codex")}
                data-testid="aiConnectCodex"
                data-component="aiConnectButton"
              >
                Codex Connect
              </button>
              <button
                type="button"
                className="line-button"
                disabled={actionPending}
                onClick={() => connectMutation.run("cursor_cli")}
                data-testid="aiConnectCursorCli"
                data-component="aiConnectButton"
              >
                Cursor CLI Connect
              </button>
            </div>
            {connectNote && <p className="ai-connect-note">{connectNote}</p>}

            <label className="field-label">Provider</label>
            <div className="ai-settings-row">
              <select
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
                <option value="anthropic">Anthropic</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
              <input
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                spellCheck={false}
                placeholder="model"
                data-testid="aiModel"
                data-component="aiModel"
              />
            </div>
            <input
              className="ai-key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
              placeholder="API key"
              spellCheck={false}
              data-testid="aiApiKey"
              data-component="aiApiKey"
            />
            {settings.provider === "openai-compatible" && (
              <input
                value={settings.baseUrl}
                onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                spellCheck={false}
                placeholder="http://127.0.0.1:11434/v1"
                data-testid="aiBaseUrl"
                data-component="aiBaseUrl"
              />
            )}

            <div className="ai-meta">
              <span>Scope: {targets.length} origins</span>
              <span>Browser: {browserUrl || "—"}</span>
            </div>

            <div className="ai-actions">
              <button
                type="button"
                className="line-button"
                onClick={() => previewMutation.run()}
                disabled={actionPending}
                data-testid="aiPreviewContext"
                data-component="aiPreviewContext"
              >
                {previewMutation.isPending ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                Preview context
              </button>
              <button
                type="button"
                className="solid-button"
                onClick={() => runMutation.run()}
                disabled={actionPending}
                data-testid="aiRunTask"
                data-component="aiRunTask"
              >
                {runMutation.isPending ? <Loader2 size={14} className="spin" /> : <Command size={14} />}
                Run task
              </button>
            </div>

            {error && <p className="ai-error">{error}</p>}
          </section>
        </div>

        {step === "preview" && preview && (
          <section className="ai-output" data-testid="aiContextPreview" data-component="aiContextPreview">
            <div className="ai-output-head">
              <strong>Context preview</strong>
              <span>
                {preview.captureCount} captures · {preview.charCount} chars ·{" "}
                {preview.redacted ? "redacted" : "raw"}
              </span>
            </div>
            <pre>{preview.previewText}</pre>
          </section>
        )}

        {step === "result" && result && (
          <section className="ai-output" data-testid="aiResult" data-component="aiResult">
            <div className="ai-output-head">
              <strong>Result</strong>
              <span>audit {result.auditId}</span>
            </div>
            <pre>{resultPreview(result)}</pre>
            {(result.output?.task === "repeater_drafts" || result.output?.task === "browser_helper") && (
              <button
                type="button"
                className="solid-button compact"
                onClick={applyPrepared}
                data-testid="aiApplyPrepared"
                data-component="aiApplyPrepared"
              >
                Apply prepared action
              </button>
            )}
          </section>
        )}

        {audit.length > 0 && (
          <section className="ai-audit" data-testid="aiAudit" data-component="aiAudit">
            <span className="field-label">Session audit</span>
            <div className="ai-audit-list">
              {audit.slice(0, 6).map((entry) => (
                <div key={entry.id} className={entry.ok ? "" : "failed"}>
                  <strong>{entry.task}</strong>
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
