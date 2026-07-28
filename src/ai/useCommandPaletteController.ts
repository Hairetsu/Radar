import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type { WorkView } from "../hooks/useRadarWorkbench";
import { useAsyncAction } from "../hooks/useAsyncAction";
import type {
  CapturedRequest,
  ReplayDraft,
  ReplayResult,
  SslEvent,
  WebSocketEvent
} from "../types";
import {
  runPayloadFromSelection,
  selectionKey,
  VIEW_AI_LABELS,
  type AiAuditEntry,
  type AiContextPreview,
  type AiRunResult,
  type AiViewContext
} from "./types";
import { useCommandPalettePackets } from "./useCommandPalettePackets";
import { useCommandPaletteSkills } from "./useCommandPaletteSkills";

export type CommandPaletteControllerInput = {
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

export type PaletteStep = "task" | "preview" | "result";

export function useCommandPaletteController({
  open,
  view,
  onClose,
  captureIds,
  captures,
  webSocketEventIds,
  webSocketEvents,
  targets,
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
}: CommandPaletteControllerInput) {
  const [step, setStep] = useState<PaletteStep>("task");
  const [includeRaw, setIncludeRaw] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [preview, setPreview] =
    useState<AiContextPreview | null>(null);
  const [result, setResult] = useState<AiRunResult | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  const [error, setError] = useState("");
  const skillController = useCommandPaletteSkills({
    open,
    view,
    onNotice,
    onError: setError
  });
  const packetController = useCommandPalettePackets({
    open,
    captureIds,
    captures,
    webSocketEventIds,
    webSocketEvents
  });
  const { selection } = skillController;
  const { resetDraft } = skillController;
  const {
    selectedCaptureIds: paletteCaptureIds,
    selectedWebSocketEventIds: paletteWebSocketEventIds,
    selectedCount: selectedPacketCount
  } = packetController;
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
    [
      caCertPath,
      draft,
      lastResponse,
      proxyRunning,
      proxyUrl,
      sslEvents,
      targets,
      view
    ]
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
    [
      includeRaw,
      paletteCaptureIds,
      paletteWebSocketEventIds,
      selection,
      userPrompt,
      view,
      viewContext
    ]
  );

  const buildPreviewAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to use AI.");
      return;
    }
    try {
      setError("");
      const next =
        await window.radar.previewAiContext(runRequestBase);
      setPreview(next);
      setStep("preview");
      if (next.blockedReason) {
        setError(next.blockedReason);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Preview failed"
      );
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
      setAudit(await window.radar.getAiAudit());
      if (!next.ok) {
        setError(next.error || "AI request failed");
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "AI request failed"
      );
    }
  }, [canRun, onOpenSettings, runRequestBase]);
  const previewMutation = useAsyncAction(buildPreviewAction);
  const runMutation = useAsyncAction(runTaskAction);
  const reset = useCallback(() => {
    setStep("task");
    setPreview(null);
    setResult(null);
    setError("");
    resetDraft();
  }, [resetDraft]);
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
      const navigate = result.output.data.steps.find(
        (stepItem) =>
          stepItem.action === "navigate" && stepItem.url
      );
      if (!navigate?.url) {
        onNotice("No navigate step to prepare.");
        return;
      }
      onPrepareNavigate(navigate.url);
      onNotice(`Prepared navigation: ${navigate.label}`);
      onClose();
    }
  }, [
    onApplyDraft,
    onClose,
    onNotice,
    onPrepareNavigate,
    result
  ]);
  const contextLabel = useMemo(() => {
    const selectedWebSocketEvents = webSocketEvents.filter((item) =>
      paletteWebSocketEventIds.includes(item.id)
    );
    switch (view) {
      case "traffic":
      case "websocket":
      case "intercept":
        if (selectedPacketCount === 0) {
          return "No packets selected";
        }
        break;
      case "repeater":
      case "automate":
        return draft.url
          ? `${draft.method} ${draft.url}`
          : "Empty repeater draft";
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
    const selected = captures.filter((item) =>
      paletteCaptureIds.includes(item.id)
    );
    if (
      selected.length === 1 &&
      selectedWebSocketEvents.length === 0
    ) {
      return `${selected[0].method} ${selected[0].host}${selected[0].path}`;
    }
    return `${
      selected.length + selectedWebSocketEvents.length
    } packets selected`;
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
    void window.radar
      ?.getAiAudit()
      .then((items) => setAudit(items));
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

  return {
    step,
    ...skillController,
    includeRaw,
    setIncludeRaw,
    userPrompt,
    setUserPrompt,
    preview,
    result,
    audit,
    error,
    paletteCaptureIds,
    setPaletteCaptureIds:
      packetController.setSelectedCaptureIds,
    paletteWebSocketEventIds,
    setPaletteWebSocketEventIds:
      packetController.setSelectedWebSocketEventIds,
    deleteSkillAction: skillController.remove,
    previewMutation,
    runMutation,
    saveSkillMutation: skillController.saveMutation,
    applyPrepared,
    togglePaletteCapture: packetController.toggleCapture,
    togglePaletteWebSocketEvent:
      packetController.toggleWebSocketEvent,
    selectedPacketCount,
    totalPacketCount: packetController.totalCount,
    contextLabel,
    actionPending:
      previewMutation.isPending ||
      runMutation.isPending ||
      skillController.saveMutation.isPending,
    activeKey: selectionKey(selection)
  };
}
