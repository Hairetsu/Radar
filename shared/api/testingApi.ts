import type {
  AutomatePayloadSet,
  AutomateSession,
  BurstResult,
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  ReplayTabState
} from "../domain.js";

export type TestingApi = {
  getReplayTabState: () => Promise<ReplayTabState>;
  setReplayTabState: (
    state: ReplayTabState
  ) => Promise<ReplayTabState>;
  getReplayEnvironments: () => Promise<ReplayEnvironment[]>;
  setReplayEnvironments: (
    environments: ReplayEnvironment[]
  ) => Promise<ReplayEnvironment[]>;
  getReplayCollections: () => Promise<ReplayCollection[]>;
  setReplayCollections: (
    collections: ReplayCollection[]
  ) => Promise<ReplayCollection[]>;
  getAutomatePayloadSets: () => Promise<AutomatePayloadSet[]>;
  setAutomatePayloadSets: (
    sets: AutomatePayloadSet[]
  ) => Promise<AutomatePayloadSet[]>;
  listAutomateSessions: () => Promise<AutomateSession[]>;
  getAutomateSession: (
    id: string
  ) => Promise<AutomateSession | null>;
  startAutomateSession: (
    payload: Partial<AutomateSession>
  ) => Promise<AutomateSession>;
  pauseAutomateSession: (
    id: string
  ) => Promise<AutomateSession | null>;
  resumeAutomateSession: (
    id: string
  ) => Promise<AutomateSession | null>;
  stopAutomateSession: (
    id: string
  ) => Promise<AutomateSession | null>;
  retryAutomateSession: (
    id: string
  ) => Promise<AutomateSession | null>;
  promoteAutomateResultToRepeater: (payload: {
    sessionId: string;
    resultId: string;
  }) => Promise<ReplayTabState>;
  sendReplay: (
    payload:
      | ReplayDraft
      | { draft: ReplayDraft; environmentId?: string }
  ) => Promise<ReplayResult>;
  runBurst: (payload: {
    request: ReplayDraft;
    count: number;
    concurrency: number;
    delayMs: number;
    environmentId?: string;
  }) => Promise<BurstResult>;
};
