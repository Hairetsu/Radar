import { Command, Loader2, Plus, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CapturedRequest, ReplayDraft, ReplayResult, SslEvent, WebSocketEvent } from "../types";
import type { WorkView } from "../hooks/useRadarWorkbench";
import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { resultPreview } from "../lib/resultPreview";
import { cn } from "../lib/utils";
import {
  AI_TASK_META,
  defaultSelection,
  runPayloadFromSelection,
  selectionKey,
  skillsForView,
  VIEW_AI_LABELS,
  VIEW_AI_TASKS,
  type AiAuditEntry,
  type AiContextPreview,
  type AiCustomSkill,
  type AiPaletteSelection,
  type AiRunResult,
  type AiTaskType,
  type AiViewContext
} from "./types";

type CommandPaletteProps = {
  open: boolean;
  view: WorkView;
  onClose: () => void;
  captureIds: string[];
  captures: CapturedRequest[];
  webSocketEventIds: string[];
  webSocketEvents: WebSocketEvent[];
  targets: string[];
  browserUrl: string;
  draft: ReplayDraft;
  lastResponse: ReplayResult | null;
  sslEvents: SslEvent[];
  proxyRunning: boolean;
  proxyUrl: string;
  caCertPath: string;
  canRun: boolean;
  onOpenSettings: () => void;
  onApplyDraft: (draft: ReplayDraft) => void;
  onPrepareNavigate: (url: string) => void;
  onNotice: (message: string) => void;
};

type PaletteStep = "task" | "preview" | "result";

const taskButtonClass = (active: boolean) =>
  cn(
    "grid h-auto w-full content-center justify-start justify-items-start gap-1 border border-rule radar-card px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors",
    "hover:border-signal/45 hover:bg-signal/[0.08]",
    active && "border-signal/45 bg-signal/[0.1]"
  );

const palettePanelClass = "grid gap-3";

const paletteMetaClass = "flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-[0.28em] text-dim";

const capturePickerRowClass = (checked: boolean) =>
  cn(
    "grid w-full cursor-pointer items-center gap-2 border-0 border-b border-rule/70 bg-transparent px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition last:border-b-0",
    "[grid-template-columns:auto_64px_minmax(0,1fr)]",
    "hover:bg-signal/[0.06] hover:text-bone",
    checked && "bg-signal/[0.08] text-bone"
  );

const packetPickerRowClass = (checked: boolean) =>
  cn(
    "grid w-full cursor-pointer items-center gap-2 border-0 border-b border-rule/70 bg-transparent px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition last:border-b-0",
    "[grid-template-columns:auto_78px_minmax(0,1fr)]",
    "hover:bg-steel/[0.07] hover:text-bone",
    checked && "bg-steel/[0.09] text-bone"
  );

const emptySkillDraft = {
  label: "",
  hint: "",
  instructions: ""
};

export function CommandPalette({
  open,
  view,
  onClose,
  captureIds,
  captures,
  webSocketEventIds,
  webSocketEvents,
  targets,
  browserUrl,
  draft,
  lastResponse,
  sslEvents,
  proxyRunning,
  proxyUrl,
  caCertPath,
  canRun,
  onOpenSettings,
  onApplyDraft,
  onPrepareNavigate,
  onNotice
}: CommandPaletteProps) {
  const [step, setStep] = useState<PaletteStep>("task");
  const [selection, setSelection] = useState<AiPaletteSelection>(() => defaultSelection(view, []));
  const [includeRaw, setIncludeRaw] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [preview, setPreview] = useState<AiContextPreview | null>(null);
  const [result, setResult] = useState<AiRunResult | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  const [skills, setSkills] = useState<AiCustomSkill[]>([]);
  const [error, setError] = useState("");
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillDraft, setSkillDraft] = useState(emptySkillDraft);
  const [paletteCaptureIds, setPaletteCaptureIds] = useState<string[]>([]);
  const [paletteWebSocketEventIds, setPaletteWebSocketEventIds] = useState<string[]>([]);

  const viewTasks = VIEW_AI_TASKS[view];
  const viewSkills = useMemo(() => skillsForView(skills, view), [skills, view]);

  const viewContext = useMemo<AiViewContext>(
    () => ({
      view,
      draft,
      lastResponse: lastResponse
        ? {
            status: lastResponse.status,
            statusText: lastResponse.statusText,
            body: lastResponse.body
          }
        : undefined,
      targets,
      sslEvents,
      proxyRunning,
      proxyUrl,
      caCertPath
    }),
    [caCertPath, draft, lastResponse, proxyRunning, proxyUrl, sslEvents, targets, view]
  );

  const runRequestBase = useMemo(
    () => ({
      ...runPayloadFromSelection(selection),
      view,
      captureIds: paletteCaptureIds,
      webSocketEventIds: paletteWebSocketEventIds,
      includeRaw,
      userPrompt,
      viewContext
    }),
    [includeRaw, paletteCaptureIds, paletteWebSocketEventIds, selection, userPrompt, view, viewContext]
  );

  const refreshSkills = useCallback(async () => {
    const next = (await window.radar?.getAiSkills()) || [];
    setSkills(next);
    return next;
  }, []);

  const buildPreviewAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    try {
      setError("");
      const next = await window.radar.previewAiContext(runRequestBase);
      setPreview(next);
      setStep("preview");
      if (next.blockedReason) {
        setError(next.blockedReason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }, [runRequestBase]);

  const runTaskAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    if (!canRun) {
      setError("Connect AI in settings before running tasks.");
      onOpenSettings();
      return;
    }
    try {
      setError("");
      const next = await window.radar.runAiTask(runRequestBase);
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
  }, [canRun, onOpenSettings, runRequestBase]);

  const saveSkillAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to save skills.");
      return;
    }
    const label = skillDraft.label.trim();
    const instructions = skillDraft.instructions.trim();
    if (!label || !instructions) {
      setError("Skill needs a label and instructions.");
      return;
    }
    try {
      setError("");
      const nextSkill: AiCustomSkill = {
        id: `skill-${Date.now()}`,
        label,
        hint: skillDraft.hint.trim() || "Custom operator skill",
        instructions,
        views: [view],
        createdAt: new Date().toISOString()
      };
      const next = await window.radar.saveAiSkill(nextSkill);
      setSkills(next);
      setSelection({ kind: "custom", skillId: nextSkill.id });
      setSkillDraft(emptySkillDraft);
      setShowSkillForm(false);
      onNotice(`Saved skill: ${label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save skill");
    }
  }, [onNotice, skillDraft, view]);

  const deleteSkillAction = useCallback(
    async (skillId: string) => {
      if (!window.radar) {
        return;
      }
      const next = await window.radar.deleteAiSkill(skillId);
      setSkills(next);
      if (selection.kind === "custom" && selection.skillId === skillId) {
        setSelection(defaultSelection(view, next));
      }
      onNotice("Skill removed");
    },
    [onNotice, selection, view]
  );

  const previewMutation = useAsyncAction(buildPreviewAction);
  const runMutation = useAsyncAction(runTaskAction);
  const saveSkillMutation = useAsyncAction(saveSkillAction);

  const reset = useCallback(() => {
    setStep("task");
    setPreview(null);
    setResult(null);
    setError("");
    setShowSkillForm(false);
    setSkillDraft(emptySkillDraft);
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

  const togglePaletteCapture = useCallback((captureId: string) => {
    setPaletteCaptureIds((current) =>
      current.includes(captureId) ? current.filter((id) => id !== captureId) : [...current, captureId]
    );
  }, []);

  const togglePaletteWebSocketEvent = useCallback((eventId: string) => {
    setPaletteWebSocketEventIds((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]
    );
  }, []);

  const selectedPacketCount = paletteCaptureIds.length + paletteWebSocketEventIds.length;
  const totalPacketCount = captures.length + webSocketEvents.length;

  const contextLabel = useMemo(() => {
    const selectedWebSocketEvents = webSocketEvents.filter((item) => paletteWebSocketEventIds.includes(item.id));
    switch (view) {
      case "traffic":
      case "websocket":
      case "intercept":
        if (selectedPacketCount === 0) {
          return "No packets selected";
        }
        break;
      case "repeater":
        return draft.url ? `${draft.method} ${draft.url}` : "Empty repeater draft";
      case "scope":
        return `${targets.length} scope targets`;
      case "ssl":
        return `${sslEvents.length} certificate events`;
    }

    if (paletteCaptureIds.length === 0) {
      if (selectedWebSocketEvents.length === 1) {
        const event = selectedWebSocketEvents[0];
        return `WS ${event.direction} ${event.host || "socket"}`;
      }
      if (selectedWebSocketEvents.length > 1) {
        return `${selectedWebSocketEvents.length} packets selected`;
      }
      return VIEW_AI_LABELS[view];
    }
    const selected = captures.filter((item) => paletteCaptureIds.includes(item.id));
    if (selected.length === 1 && selectedWebSocketEvents.length === 0) {
      return `${selected[0].method} ${selected[0].host}${selected[0].path}`;
    }
    return `${selected.length + selectedWebSocketEvents.length} packets selected`;
  }, [
    captures,
    draft.method,
    draft.url,
    paletteCaptureIds,
    paletteWebSocketEventIds,
    selectedPacketCount,
    sslEvents.length,
    targets.length,
    view,
    webSocketEvents
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.radar?.getAiAudit().then((items) => setAudit(items));
    refreshSkills().then((next) => setSelection(defaultSelection(view, next)));
    setPaletteCaptureIds(captureIds);
    setPaletteWebSocketEventIds(webSocketEventIds);
  }, [captureIds, open, refreshSkills, view, webSocketEventIds]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelection((current) => {
      if (current.kind === "custom" && viewSkills.some((skill) => skill.id === current.skillId)) {
        return current;
      }
      if (current.kind === "builtin" && viewTasks.includes(current.task)) {
        return current;
      }
      return defaultSelection(view, skills);
    });
  }, [open, skills, view, viewSkills, viewTasks]);

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

  const actionPending = previewMutation.isPending || runMutation.isPending || saveSkillMutation.isPending;
  const activeKey = selectionKey(selection);

  if (!open) {
    return null;
  }

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="commandPaletteBackdrop"
      data-component="commandPaletteBackdrop"
    >
      <div
        className="theme-modal-surface grid max-h-[calc(100vh-5rem)] w-full max-w-5xl gap-4 overflow-auto border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        data-testid="commandPalette"
        data-component="commandPalette"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal">
              <Command size={12} strokeWidth={1.8} /> AI Channel · {VIEW_AI_LABELS[view]}
            </span>
            <h3 className="font-display text-[28px] uppercase tracking-[0.08em] text-bone">Command Palette</h3>
            <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-muted">{contextLabel}</p>
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
            <div className="flex items-center justify-between gap-3">
              <FieldLabel className="px-0 pt-0">Skills</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="compact"
                onClick={() => setShowSkillForm((openForm) => !openForm)}
                data-testid="aiToggleSkillForm"
                data-component="aiToggleSkillForm"
              >
                <Plus size={12} strokeWidth={1.8} />
                Add skill
              </Button>
            </div>

            {showSkillForm && (
              <div className="grid gap-2 border border-dashed radar-note p-3">
                <Input
                  variant="compact"
                  value={skillDraft.label}
                  onChange={(event) => setSkillDraft({ ...skillDraft, label: event.target.value })}
                  placeholder="Skill name"
                  spellCheck={false}
                  data-testid="aiSkillLabel"
                  data-component="aiSkillLabel"
                />
                <Input
                  variant="compact"
                  value={skillDraft.hint}
                  onChange={(event) => setSkillDraft({ ...skillDraft, hint: event.target.value })}
                  placeholder="Short hint"
                  spellCheck={false}
                  data-testid="aiSkillHint"
                  data-component="aiSkillHint"
                />
                <Textarea
                  variant="bare"
                  className="min-h-[88px]"
                  value={skillDraft.instructions}
                  onChange={(event) => setSkillDraft({ ...skillDraft, instructions: event.target.value })}
                  placeholder="Instructions for this view"
                  spellCheck={false}
                  data-testid="aiSkillInstructions"
                  data-component="aiSkillInstructions"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="solid"
                    size="compact"
                    disabled={actionPending}
                    onClick={() => saveSkillMutation.run()}
                    data-testid="aiSaveSkill"
                    data-component="aiSaveSkill"
                  >
                    Save to {view}
                  </Button>
                  <Button type="button" variant="outline" size="compact" onClick={() => setShowSkillForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              {viewTasks.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  className={taskButtonClass(selection.kind === "builtin" && selection.task === key)}
                  onClick={() => setSelection({ kind: "builtin", task: key as AiTaskType })}
                  data-testid={`aiTask-${key}`}
                  data-component="aiTaskButton"
                >
                  <strong className="block w-full text-left tracking-[0.22em] text-bone">{AI_TASK_META[key].label}</strong>
                  <span className="block w-full text-left text-dim tracking-[0.14em] leading-[1.4]">
                    {AI_TASK_META[key].hint}
                  </span>
                </Button>
              ))}

              {viewSkills.map((skill) => (
                <div key={skill.id} className="grid gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className={taskButtonClass(selection.kind === "custom" && selection.skillId === skill.id)}
                    onClick={() => setSelection({ kind: "custom", skillId: skill.id })}
                    data-testid={`aiSkill-${skill.id}`}
                    data-component="aiSkillButton"
                  >
                    <strong className="block w-full text-left tracking-[0.22em] text-bone">{skill.label}</strong>
                    <span className="block w-full text-left text-dim tracking-[0.14em] leading-[1.4]">{skill.hint}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="h-7 justify-start px-2 text-[9px] uppercase tracking-[0.22em] text-rust hover:bg-rust/10"
                    onClick={() => deleteSkillAction(skill.id)}
                    data-testid={`aiDeleteSkill-${skill.id}`}
                    data-component="aiDeleteSkillButton"
                  >
                    <Trash2 size={11} strokeWidth={1.7} />
                    Remove skill
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel className="px-0 pt-0">
                  Packets ({selectedPacketCount}/{totalPacketCount})
                </FieldLabel>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    disabled={totalPacketCount === 0}
                    onClick={() => {
                      setPaletteCaptureIds(captures.map((capture) => capture.id));
                      setPaletteWebSocketEventIds(webSocketEvents.map((event) => event.id));
                    }}
                    data-testid="aiSelectAllPackets"
                    data-component="aiSelectAllPackets"
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    disabled={selectedPacketCount === 0}
                    onClick={() => {
                      setPaletteCaptureIds([]);
                      setPaletteWebSocketEventIds([]);
                    }}
                    data-testid="aiClearPackets"
                    data-component="aiClearPackets"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div
                className="max-h-44 overflow-auto border border-rule radar-panel"
                data-testid="aiPacketPicker"
                data-component="aiPacketPicker"
              >
                {totalPacketCount === 0 && (
                  <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
                    No HTTP or WebSocket packets
                  </p>
                )}
                {captures.length > 0 && (
                  <div className="border-b border-rule/70 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.28em] text-dim">
                    HTTP / HTTPS ({paletteCaptureIds.length}/{captures.length})
                  </div>
                )}
                {captures.map((capture) => {
                  const checked = paletteCaptureIds.includes(capture.id);
                  return (
                    <label
                      key={capture.id}
                      className={capturePickerRowClass(checked)}
                      data-testid={`aiCaptureOption-${capture.id}`}
                      data-component="aiCaptureOption"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePaletteCapture(capture.id)}
                        data-testid={`aiCaptureCheckbox-${capture.id}`}
                        data-component="aiCaptureCheckbox"
                      />
                      <span className="font-bold text-signal">{capture.method}</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {capture.host}
                        {capture.path}
                      </span>
                    </label>
                  );
                })}
                {webSocketEvents.length > 0 && (
                  <div className="border-b border-rule/70 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.28em] text-dim">
                    WebSocket ({paletteWebSocketEventIds.length}/{webSocketEvents.length})
                  </div>
                )}
                {webSocketEvents.map((event) => {
                  const checked = paletteWebSocketEventIds.includes(event.id);
                  return (
                    <label
                      key={event.id}
                      className={packetPickerRowClass(checked)}
                      data-testid={`aiWebSocketOption-${event.id}`}
                      data-component="aiWebSocketOption"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePaletteWebSocketEvent(event.id)}
                        data-testid={`aiWebSocketCheckbox-${event.id}`}
                        data-component="aiWebSocketCheckbox"
                      />
                      <span className="font-bold text-steel">{event.direction}</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {event.host || "socket"} · {event.payloadData || event.url}
                      </span>
                    </label>
                  );
                })}
              </div>
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
              Send raw headers, bodies, and payloads (explicit)
            </label>
          </section>

          <section className={palettePanelClass}>
            <FieldLabel className="px-0 pt-0">Run</FieldLabel>
            {!canRun && (
              <p className="border border-rust/30 bg-rust/5 px-3 py-2 font-mono text-[9px] uppercase leading-[1.6] tracking-[0.2em] text-rust">
                AI is not connected.{" "}
                <button
                  type="button"
                  className="text-signal underline-offset-2 hover:underline"
                  onClick={onOpenSettings}
                  data-testid="aiOpenSettingsFromPalette"
                  data-component="aiOpenSettingsFromPalette"
                >
                  Open connection settings
                </button>
              </p>
            )}

            <div className={paletteMetaClass}>
              <span>Scope: {targets.length} origins</span>
              <span>Browser: {browserUrl || "—"}</span>
              <span>Skill: {activeKey}</span>
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
          <section
            className="grid gap-2 border-t border-rule pt-4"
            data-testid="aiContextPreview"
            data-component="aiContextPreview"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
              <strong>Context preview</strong>
              <span>
                {preview.captureCount + (preview.webSocketEventCount || 0)} packets · {preview.charCount} chars ·{" "}
                {preview.redacted ? "redacted" : "raw"}
              </span>
            </div>
            <pre className="max-h-64 overflow-auto border border-rule radar-panel p-3 text-[11px] leading-[1.5]">
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
            <pre className="max-h-64 overflow-auto border border-rule radar-panel p-3 text-[11px] leading-[1.5]">
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
                  <strong className="tracking-[0.24em] text-bone">
                    {entry.skillId ? `custom:${entry.skillId}` : entry.task}
                  </strong>
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
