import { Command, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CapturedRequest, ReplayDraft } from "../types";
import {
  AI_TASK_META,
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

function resultPreview(result: AiRunResult) {
  if (!result.ok || !result.output) {
    return result.error || "AI request failed.";
  }

  const { output } = result;
  switch (output.task) {
    case "capture_summary":
      return [
        output.data.summary,
        "",
        "Observations:",
        ...output.data.observations.map((line) => `- ${line}`),
        "",
        "Uncertainties:",
        ...output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "repeater_drafts":
      return output.data.drafts
        .map(
          (draft, index) =>
            `${index + 1}. ${draft.label}\n${draft.rationale}\n${draft.draft.method} ${draft.draft.url}`
        )
        .join("\n\n");
    case "scope_checklist":
      return output.data.items
        .map((item) => `${item.title}\n${item.steps.map((step) => `  - ${step}`).join("\n")}`)
        .join("\n\n");
    case "report_notes":
      return [
        output.data.notes,
        "",
        "Evidence:",
        ...output.data.evidenceRefs.map((ref) => `- ${ref}`),
        "",
        "Uncertainties:",
        ...output.data.uncertainties.map((line) => `- ${line}`)
      ].join("\n");
    case "browser_helper":
      return output.data.steps
        .map((step, index) => `${index + 1}. [${step.action}] ${step.label}${step.url ? ` → ${step.url}` : ""}`)
        .join("\n");
    default:
      return result.rawText || "";
  }
}

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
  const [busy, setBusy] = useState<"" | "preview" | "run" | "connect">("");
  const [connectNote, setConnectNote] = useState("");
  const [error, setError] = useState("");

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

  const reset = useCallback(() => {
    setStep("task");
    setPreview(null);
    setResult(null);
    setError("");
    setBusy("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    window.radar?.getAiSettings().then((next) => setSettings(next));
    window.radar?.getAiAudit().then((items) => setAudit(items));
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
  }, [open, onClose]);

  async function persistSettings(next: AiSettings) {
    const saved = (await window.radar?.setAiSettings(next)) || next;
    setSettings(saved);
  }

  async function connectPreset(presetId: AiConnectPresetId) {
    if (!window.radar) {
      setError("Run in Electron to connect.");
      return;
    }
    setBusy("connect");
    setError("");
    try {
      const next = await window.radar.connectAi(presetId);
      setSettings(next.settings);
      const source =
        next.meta.apiKeySource === "missing"
          ? " — add API key or env var"
          : ` · key from ${next.meta.apiKeySource}`;
      setConnectNote(`${next.meta.label}: ${next.probe.message}${source}`);
      if (!next.probe.ok) {
        setError(next.probe.message);
      } else {
        onNotice(`${next.meta.label} connected`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy("");
    }
  }

  async function buildPreview() {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    setBusy("preview");
    setError("");
    try {
      const next = await window.radar.previewAiContext({ task, captureIds, includeRaw, userPrompt });
      setPreview(next);
      setStep("preview");
      if (next.blockedReason) {
        setError(next.blockedReason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy("");
    }
  }

  async function runTask() {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    if (!settings.apiKey.trim()) {
      setError("Set an API key in AI settings.");
      return;
    }
    setBusy("run");
    setError("");
    try {
      await persistSettings(settings);
      const next = await window.radar.runAiTask({ task, captureIds, includeRaw, userPrompt });
      setResult(next);
      setStep("result");
      const items = await window.radar.getAiAudit();
      setAudit(items);
      if (!next.ok) {
        setError(next.error || "AI request failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setBusy("");
    }
  }

  function applyPrepared() {
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
      const navigate = result.output.data.steps.find((step) => step.action === "navigate" && step.url);
      if (!navigate?.url) {
        onNotice("No navigate step to prepare.");
        return;
      }
      onPrepareNavigate(navigate.url);
      onNotice(`Prepared navigation: ${navigate.label}`);
      onClose();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="ai-palette-backdrop" onClick={onClose}>
      <div className="ai-palette" onClick={(event) => event.stopPropagation()}>
        <header className="ai-palette-head">
          <div>
            <span className="eyebrow">
              <Command size={12} strokeWidth={1.8} /> AI Channel
            </span>
            <h3>Command Palette</h3>
            <p>{captureLabel}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="ai-palette-grid">
          <section className="ai-panel">
            <label className="field-label">Task</label>
            <div className="ai-task-list">
              {(Object.keys(AI_TASK_META) as AiTaskType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={task === key ? "active" : ""}
                  onClick={() => setTask(key)}
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
            />

            <label className="ai-raw-toggle">
              <input
                type="checkbox"
                checked={includeRaw}
                onChange={(event) => setIncludeRaw(event.target.checked)}
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
                disabled={busy !== ""}
                onClick={() => connectPreset("codex")}
              >
                Codex Connect
              </button>
              <button
                type="button"
                className="line-button"
                disabled={busy !== ""}
                onClick={() => connectPreset("cursor_cli")}
              >
                Cursor CLI Connect
              </button>
            </div>
            {connectNote && <p className="ai-connect-note">{connectNote}</p>}

            <label className="field-label">Provider</label>
            <div className="ai-settings-row">
              <select
                value={settings.provider}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    provider: event.target.value as AiSettings["provider"]
                  })
                }
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
              />
            </div>
            <input
              className="ai-key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
              placeholder="API key"
              spellCheck={false}
            />
            {settings.provider === "openai-compatible" && (
              <input
                value={settings.baseUrl}
                onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                spellCheck={false}
                placeholder="http://127.0.0.1:11434/v1"
              />
            )}

            <div className="ai-meta">
              <span>Scope: {targets.length} origins</span>
              <span>Browser: {browserUrl || "—"}</span>
            </div>

            <div className="ai-actions">
              <button type="button" className="line-button" onClick={buildPreview} disabled={busy !== ""}>
                {busy === "preview" ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                Preview context
              </button>
              <button type="button" className="solid-button" onClick={runTask} disabled={busy !== ""}>
                {busy === "run" ? <Loader2 size={14} className="spin" /> : <Command size={14} />}
                Run task
              </button>
            </div>

            {error && <p className="ai-error">{error}</p>}
          </section>
        </div>

        {step === "preview" && preview && (
          <section className="ai-output">
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
          <section className="ai-output">
            <div className="ai-output-head">
              <strong>Result</strong>
              <span>audit {result.auditId}</span>
            </div>
            <pre>{resultPreview(result)}</pre>
            {(result.output?.task === "repeater_drafts" || result.output?.task === "browser_helper") && (
              <button type="button" className="solid-button compact" onClick={applyPrepared}>
                Apply prepared action
              </button>
            )}
          </section>
        )}

        {audit.length > 0 && (
          <section className="ai-audit">
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
