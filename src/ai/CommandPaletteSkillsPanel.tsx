import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { WorkView } from "../hooks/useRadarWorkbench";
import type {
  CapturedRequest,
  WebSocketEvent
} from "../types";
import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { AI_TASK_META, type AiTaskType } from "./types";
import {
  capturePickerRowClass,
  packetPickerRowClass,
  palettePanelClass,
  taskButtonClass
} from "./commandPalettePresentation";
import type { useCommandPaletteController } from "./useCommandPaletteController";

type CommandPaletteController = ReturnType<
  typeof useCommandPaletteController
>;

export function CommandPaletteSkillsPanel({
  view,
  captures,
  webSocketEvents,
  controller
}: {
  view: WorkView;
  captures: CapturedRequest[];
  webSocketEvents: WebSocketEvent[];
  controller: CommandPaletteController;
}) {
  const {
    selection,
    setSelection,
    includeRaw,
    setIncludeRaw,
    userPrompt,
    setUserPrompt,
    viewTasks,
    viewSkills,
    showSkillForm,
    setShowSkillForm,
    skillDraft,
    setSkillDraft,
    paletteCaptureIds,
    setPaletteCaptureIds,
    paletteWebSocketEventIds,
    setPaletteWebSocketEventIds,
    deleteSkillAction,
    saveSkillMutation,
    togglePaletteCapture,
    togglePaletteWebSocketEvent,
    selectedPacketCount,
    totalPacketCount,
    actionPending
  } = controller;

  return (
    <section className={palettePanelClass}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel className="px-0 pt-0">Skills</FieldLabel>
        <Button
          type="button"
          variant="outline"
          size="compact"
          onClick={() =>
            setShowSkillForm((openForm) => !openForm)
          }
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
            onChange={(event) =>
              setSkillDraft({
                ...skillDraft,
                label: event.target.value
              })
            }
            placeholder="Skill name"
            spellCheck={false}
            data-testid="aiSkillLabel"
            data-component="aiSkillLabel"
          />
          <Input
            variant="compact"
            value={skillDraft.hint}
            onChange={(event) =>
              setSkillDraft({
                ...skillDraft,
                hint: event.target.value
              })
            }
            placeholder="Short hint"
            spellCheck={false}
            data-testid="aiSkillHint"
            data-component="aiSkillHint"
          />
          <Textarea
            variant="bare"
            className="min-h-[88px]"
            value={skillDraft.instructions}
            onChange={(event) =>
              setSkillDraft({
                ...skillDraft,
                instructions: event.target.value
              })
            }
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
            <Button
              type="button"
              variant="outline"
              size="compact"
              onClick={() => setShowSkillForm(false)}
            >
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
            className={taskButtonClass(
              selection.kind === "builtin" &&
                selection.task === key
            )}
            onClick={() =>
              setSelection({
                kind: "builtin",
                task: key as AiTaskType
              })
            }
            data-testid={`aiTask-${key}`}
            data-component="aiTaskButton"
          >
            <strong className="block w-full text-left tracking-eyebrow text-bone">
              {AI_TASK_META[key].label}
            </strong>
            <span className="block w-full text-left text-dim tracking-label leading-[1.4]">
              {AI_TASK_META[key].hint}
            </span>
          </Button>
        ))}

        {viewSkills.map((skill) => (
          <div key={skill.id} className="grid gap-1">
            <Button
              type="button"
              variant="ghost"
              className={taskButtonClass(
                selection.kind === "custom" &&
                  selection.skillId === skill.id
              )}
              onClick={() =>
                setSelection({
                  kind: "custom",
                  skillId: skill.id
                })
              }
              data-testid={`aiSkill-${skill.id}`}
              data-component="aiSkillButton"
            >
              <strong className="block w-full text-left tracking-eyebrow text-bone">
                {skill.label}
              </strong>
              <span className="block w-full text-left text-dim tracking-label leading-[1.4]">
                {skill.hint}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="h-7 justify-start px-2 text-micro uppercase tracking-eyebrow text-rust hover:bg-rust/10"
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
                setPaletteCaptureIds(
                  captures.map((capture) => capture.id)
                );
                setPaletteWebSocketEventIds(
                  webSocketEvents.map((event) => event.id)
                );
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
            <p className="px-3 py-2 rd-label text-dim">
              No HTTP or WebSocket packets
            </p>
          )}
          {captures.length > 0 && (
            <div className="border-b border-rule/70 px-2 py-1 rd-eyebrow text-dim">
              HTTP / HTTPS ({paletteCaptureIds.length}/
              {captures.length})
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
                  onChange={() =>
                    togglePaletteCapture(capture.id)
                  }
                  data-testid={`aiCaptureCheckbox-${capture.id}`}
                  data-component="aiCaptureCheckbox"
                />
                <span className="font-bold text-signal">
                  {capture.method}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {capture.host}
                  {capture.path}
                </span>
              </label>
            );
          })}
          {webSocketEvents.length > 0 && (
            <div className="border-b border-rule/70 px-2 py-1 rd-eyebrow text-dim">
              WebSocket ({paletteWebSocketEventIds.length}/
              {webSocketEvents.length})
            </div>
          )}
          {webSocketEvents.map((event) => {
            const checked = paletteWebSocketEventIds.includes(
              event.id
            );
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
                  onChange={() =>
                    togglePaletteWebSocketEvent(event.id)
                  }
                  data-testid={`aiWebSocketCheckbox-${event.id}`}
                  data-component="aiWebSocketCheckbox"
                />
                <span className="font-bold text-steel">
                  {event.direction}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {event.host || "socket"} ·{" "}
                  {event.payloadData || event.url}
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

      <label className="flex items-center gap-2 rd-label text-muted">
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
  );
}
