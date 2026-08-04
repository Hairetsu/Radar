import type { AppMode } from "../agent-types.js";
import type {
  AgentChangedEvent,
  AiConnectionSummary,
  AiOperatorSection,
  AiOperatorWindowState,
  AppModeChangedEvent,
  WorkspaceContextSnapshot,
  WorkspaceControlIntent,
  WorkspaceIntentResult
} from "../windowCoordination.js";

export type Unsubscribe = () => void;

export type WindowCoordinationApi = {
  openAiOperator: (section?: AiOperatorSection) => Promise<AiOperatorWindowState>;
  getAiOperatorWindowState: () => Promise<AiOperatorWindowState>;
  getAppMode: () => Promise<AppMode>;
  setAppMode: (mode: AppMode) => Promise<AppMode>;
  publishWorkspaceContext: (context: WorkspaceContextSnapshot) => Promise<WorkspaceContextSnapshot>;
  onWorkspaceIntent: (listener: (intent: WorkspaceControlIntent) => void) => Unsubscribe;
  onAiOperatorWindowState: (listener: (state: AiOperatorWindowState) => void) => Unsubscribe;
  onAppModeChanged: (listener: (event: AppModeChangedEvent) => void) => Unsubscribe;
  onAgentChanged: (listener: (event: AgentChangedEvent) => void) => Unsubscribe;
  onAiConnectionChanged: (listener: (summary: AiConnectionSummary) => void) => Unsubscribe;
};

export type AiOperatorWindowApi = {
  openAiOperator: (section?: AiOperatorSection) => Promise<AiOperatorWindowState>;
  getWorkspaceContext: () => Promise<WorkspaceContextSnapshot | null>;
  dispatchWorkspaceIntent: (intent: WorkspaceControlIntent) => Promise<WorkspaceIntentResult>;
  focusWorkspace: () => Promise<WorkspaceIntentResult>;
  getAiOperatorWindowState: () => Promise<AiOperatorWindowState>;
  getAppMode: () => Promise<AppMode>;
  setAppMode: (mode: AppMode) => Promise<AppMode>;
  onWorkspaceContextChanged: (listener: (context: WorkspaceContextSnapshot) => void) => Unsubscribe;
  onAiOperatorWindowState: (listener: (state: AiOperatorWindowState) => void) => Unsubscribe;
  onAppModeChanged: (listener: (event: AppModeChangedEvent) => void) => Unsubscribe;
  onAgentChanged: (listener: (event: AgentChangedEvent) => void) => Unsubscribe;
  onAiConnectionChanged: (listener: (summary: AiConnectionSummary) => void) => Unsubscribe;
};
