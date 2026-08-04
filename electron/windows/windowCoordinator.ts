import type { BrowserWindow, Rectangle } from "electron";
import { screen } from "electron";
import type { AppMode } from "../../shared/agent-types.js";
import {
  WINDOW_CHANNELS,
  normalizeAiOperatorSection,
  normalizeWorkspaceContextSnapshot,
  type AgentChangedEvent,
  type AiConnectionSummary,
  type AiOperatorSection,
  type AiOperatorWindowState,
  type AppModeChangedEvent,
  type RadarWindowRole,
  type WorkspaceContextSnapshot,
  type WorkspaceControlIntent
} from "../../shared/windowCoordination.js";
import { clampWindowBounds, readAiOperatorBounds, writeAiOperatorBounds } from "./windowState.js";

type WindowCoordinatorDependencies = {
  stateFile: string;
  createAiWindow: (bounds: Rectangle) => BrowserWindow;
};

function safeSend(window: BrowserWindow | null, channel: string, payload: unknown) {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

export function createWindowCoordinator(dependencies: WindowCoordinatorDependencies) {
  let workspaceWindow: BrowserWindow | null = null;
  let aiOperatorWindow: BrowserWindow | null = null;
  let workspaceContext: WorkspaceContextSnapshot | null = null;
  let appMode: AppMode = "manual-first";
  let modeRevision = 0;
  let contextRevision = 0;
  let agentRevision = 0;
  let connectionRevision = 0;
  let section: AiOperatorSection = "runs";
  let quitting = false;
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;

  const windowState = (): AiOperatorWindowState => ({
    created: Boolean(aiOperatorWindow && !aiOperatorWindow.isDestroyed()),
    visible: Boolean(aiOperatorWindow && !aiOperatorWindow.isDestroyed() && aiOperatorWindow.isVisible()),
    focused: Boolean(aiOperatorWindow && !aiOperatorWindow.isDestroyed() && aiOperatorWindow.isFocused()),
    section
  });

  const publishWindowState = () => {
    const state = windowState();
    safeSend(workspaceWindow, WINDOW_CHANNELS.aiOperatorStateChanged, state);
    safeSend(aiOperatorWindow, WINDOW_CHANNELS.aiOperatorStateChanged, state);
    return state;
  };

  const persistBounds = () => {
    if (!aiOperatorWindow || aiOperatorWindow.isDestroyed()) {
      return;
    }
    try {
      writeAiOperatorBounds(dependencies.stateFile, aiOperatorWindow.getBounds());
    } catch {
      // Window placement is a convenience; failure must not affect project state.
    }
  };

  const scheduleBoundsWrite = () => {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
    }
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      persistBounds();
    }, 250);
  };

  const initialBounds = () => {
    const workspaceBounds = workspaceWindow && !workspaceWindow.isDestroyed()
      ? workspaceWindow.getBounds()
      : { x: 80, y: 80, width: 1480, height: 940 };
    const display = screen.getDisplayMatching(workspaceBounds);
    const saved = readAiOperatorBounds(dependencies.stateFile);
    if (saved) {
      return clampWindowBounds(saved, display.workArea);
    }
    const target = {
      x: workspaceBounds.x + workspaceBounds.width + 12,
      y: workspaceBounds.y,
      width: 1040,
      height: 840
    };
    const rightEdge = display.workArea.x + display.workArea.width;
    if (target.x + target.width > rightEdge) {
      target.x = display.workArea.x + Math.max(0, Math.round((display.workArea.width - target.width) / 2));
      target.y = display.workArea.y + Math.max(0, Math.round((display.workArea.height - target.height) / 2));
    }
    return clampWindowBounds(target, display.workArea);
  };

  const bindAiWindow = (window: BrowserWindow) => {
    aiOperatorWindow = window;
    window.on("focus", publishWindowState);
    window.on("blur", publishWindowState);
    window.on("show", publishWindowState);
    window.on("hide", publishWindowState);
    window.on("move", scheduleBoundsWrite);
    window.on("resize", scheduleBoundsWrite);
    window.on("close", (event) => {
      persistBounds();
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on("closed", () => {
      aiOperatorWindow = null;
      publishWindowState();
    });
  };

  const focusWorkspace = () => {
    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
      return false;
    }
    workspaceWindow.show();
    workspaceWindow.focus();
    return true;
  };

  return {
    attachWorkspace(window: BrowserWindow) {
      workspaceWindow = window;
      window.on("closed", () => {
        workspaceWindow = null;
      });
    },
    roleForWebContents(webContentsId: number): RadarWindowRole | null {
      if (workspaceWindow?.webContents.id === webContentsId) {
        return "workspace";
      }
      if (aiOperatorWindow?.webContents.id === webContentsId) {
        return "ai-operator";
      }
      return null;
    },
    showAiOperator(requestedSection?: AiOperatorSection) {
      section = normalizeAiOperatorSection(requestedSection);
      if (!aiOperatorWindow || aiOperatorWindow.isDestroyed()) {
        bindAiWindow(dependencies.createAiWindow(initialBounds()));
      }
      aiOperatorWindow!.show();
      aiOperatorWindow!.focus();
      publishWindowState();
      return windowState();
    },
    state: windowState,
    focusWorkspace,
    forwardWorkspaceIntent(intent: WorkspaceControlIntent) {
      if (!workspaceWindow || workspaceWindow.isDestroyed()) {
        return false;
      }
      if (intent.type === "focus-workspace") {
        return focusWorkspace();
      }
      safeSend(workspaceWindow, WINDOW_CHANNELS.workspaceIntent, intent);
      return true;
    },
    publishWorkspaceContext(value: unknown) {
      const normalized = normalizeWorkspaceContextSnapshot(value);
      if (!normalized) {
        return null;
      }
      contextRevision += 1;
      workspaceContext = { ...normalized, revision: contextRevision, mode: appMode };
      safeSend(aiOperatorWindow, WINDOW_CHANNELS.workspaceContextChanged, workspaceContext);
      return workspaceContext;
    },
    workspaceContext() {
      return workspaceContext;
    },
    appMode() {
      return appMode;
    },
    setAppMode(mode: AppMode) {
      if (mode === appMode) {
        return appMode;
      }
      appMode = mode;
      modeRevision += 1;
      const event: AppModeChangedEvent = { mode, revision: modeRevision };
      safeSend(workspaceWindow, WINDOW_CHANNELS.appModeChanged, event);
      safeSend(aiOperatorWindow, WINDOW_CHANNELS.appModeChanged, event);
      if (workspaceContext) {
        workspaceContext = { ...workspaceContext, mode, revision: ++contextRevision };
        safeSend(aiOperatorWindow, WINDOW_CHANNELS.workspaceContextChanged, workspaceContext);
      }
      return appMode;
    },
    publishAgentChanged(runId: string) {
      const id = String(runId || "").trim().slice(0, 160);
      if (!id) {
        return;
      }
      const event: AgentChangedEvent = { runId: id, revision: ++agentRevision };
      safeSend(workspaceWindow, WINDOW_CHANNELS.agentChanged, event);
      safeSend(aiOperatorWindow, WINDOW_CHANNELS.agentChanged, event);
    },
    publishAiConnection(summary: Omit<AiConnectionSummary, "revision">) {
      const event: AiConnectionSummary = { ...summary, revision: ++connectionRevision };
      safeSend(workspaceWindow, WINDOW_CHANNELS.aiConnectionChanged, event);
      safeSend(aiOperatorWindow, WINDOW_CHANNELS.aiConnectionChanged, event);
      return event;
    },
    reclampAiOperator() {
      if (!aiOperatorWindow || aiOperatorWindow.isDestroyed()) {
        return null;
      }
      const current = aiOperatorWindow.getBounds();
      const display = screen.getDisplayMatching(current);
      const next = clampWindowBounds(current, display.workArea);
      aiOperatorWindow.setBounds(next);
      persistBounds();
      return next;
    },
    destroy() {
      quitting = true;
      if (boundsTimer) {
        clearTimeout(boundsTimer);
        boundsTimer = null;
      }
      persistBounds();
      if (aiOperatorWindow && !aiOperatorWindow.isDestroyed()) {
        aiOperatorWindow.destroy();
      }
      aiOperatorWindow = null;
    }
  };
}

export type WindowCoordinator = ReturnType<typeof createWindowCoordinator>;
