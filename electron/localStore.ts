import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type {
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalWorkspace
} from "../shared/domain.js";
import { createId, nowIso } from "./store/ids.js";
import {
  assertSupportedLocalStoreVersion,
  LOCAL_STORE_SCHEMA_VERSION,
  runLocalStoreMigrations
} from "./store/migrations.js";
import { createAgentRunsRepository } from "./store/repositories/agentRuns.js";
import { createAiModelsRepository } from "./store/repositories/aiModels.js";
import { createAutomateRepository } from "./store/repositories/automate.js";
import { createEvidenceAnnotationsRepository } from "./store/repositories/evidenceAnnotations.js";
import { createEvidenceRepository } from "./store/repositories/evidence.js";
import { createFindingsRepository } from "./store/repositories/findings.js";
import { createIdentityRepository } from "./store/repositories/identity.js";
import { createPluginsRepository } from "./store/repositories/plugins.js";
import { createProjectArtifactsRepository } from "./store/repositories/projectArtifacts.js";
import { createRepeaterRepository } from "./store/repositories/repeater.js";
import { createWorkflowsRepository } from "./store/repositories/workflows.js";
import { createWorkspaceSettingsRepository } from "./store/repositories/workspaceSettings.js";
import { toProfile, toSession, toSessionSummary, toWorkspace } from "./store/rowMappers/local.js";
import type {
  ProfileRow,
  SessionRow,
  SessionSummaryRow,
  WorkspaceRow
} from "./store/rows.js";
import { applyCurrentSchema } from "./store/schema.js";
import {
  configureLocalStoreDatabase,
  runImmediateTransaction
} from "./store/transactions.js";

export { LOCAL_STORE_SCHEMA_VERSION } from "./store/migrations.js";
const SCHEMA_VERSION = String(LOCAL_STORE_SCHEMA_VERSION);
const DEFAULT_PROFILE_NAME = "Local Operator";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";
const MAX_NAME_LENGTH = 80;

function defaultSessionName(createdAt = nowIso()) {
  return `Session ${createdAt.slice(0, 16).replace("T", " ")}`;
}

function normalizeName(value: string | undefined, fallback: string) {
  const next = String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return next || fallback;
}

export type LocalStore = ReturnType<typeof openLocalStore>;

export function openLocalStore(userDataPath: string) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new DatabaseSync(path.join(userDataPath, "radar-local.sqlite"));
  try {
    assertSupportedLocalStoreVersion(db);
  } catch (error) {
    db.close();
    throw error;
  }
  configureLocalStoreDatabase(db);


  try {
    runLocalStoreMigrations(db, [
      {
        version: LOCAL_STORE_SCHEMA_VERSION,
        name: "current-workbench-schema",
        up: () => applyCurrentSchema(db)
      }
    ]);
  } catch (error) {
    db.close();
    throw error;
  }

  const readMeta = (key: string) => {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || "";
  };

  const writeMeta = (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  };

  const {
    setTargets,
    getTargets,
    listInterceptRules,
    setInterceptRules,
    listMatchReplaceRules,
    setMatchReplaceRules,
    listProxyProfiles,
    saveProxyProfile,
    listSavedFilters,
    setSavedFilters
  } = createWorkspaceSettingsRepository(db);

  const createProfile = (name = DEFAULT_PROFILE_NAME): LocalProfile => {
    const createdAt = nowIso();
    const profile: LocalProfile = {
      id: createId("profile"),
      name: normalizeName(name, DEFAULT_PROFILE_NAME),
      createdAt,
      updatedAt: createdAt
    };
    db.prepare("INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      profile.id,
      profile.name,
      profile.createdAt,
      profile.updatedAt
    );
    return profile;
  };

  const createWorkspace = (profileId: string, name = DEFAULT_WORKSPACE_NAME): LocalWorkspace => {
    const createdAt = nowIso();
    const workspace: LocalWorkspace = {
      id: createId("workspace"),
      profileId,
      name,
      createdAt,
      updatedAt: createdAt
    };
    db.prepare(
      "INSERT INTO workspaces (id, profile_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspace.id, workspace.profileId, workspace.name, workspace.createdAt, workspace.updatedAt);
    setTargets(workspace.id, [...DEFAULT_ALLOWLIST]);
    return workspace;
  };

  const createSession = (workspaceId: string, name?: string): LocalSession => {
    const createdAt = nowIso();
    const session: LocalSession = {
      id: createId("session"),
      workspaceId,
      name: normalizeName(name, defaultSessionName(createdAt)),
      startedAt: createdAt,
      updatedAt: createdAt
    };
    runImmediateTransaction(db, () => {
      db.prepare(
        "INSERT INTO sessions (id, workspace_id, name, started_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(session.id, session.workspaceId, session.name, session.startedAt, session.updatedAt);
      writeMeta("active_session_id", session.id);
    });
    return session;
  };

  const getProfile = (id: string) => {
    const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
    return row ? toProfile(row) : null;
  };

  const getWorkspace = (id: string) => {
    const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  };

  const getSession = (id: string) => {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row ? toSession(row) : null;
  };

  const latestWorkspaceForProfile = (profileId: string) => {
    const row = db
      .prepare("SELECT * FROM workspaces WHERE profile_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1")
      .get(profileId) as WorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  };

  const latestSessionForWorkspace = (workspaceId: string) => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC, started_at DESC LIMIT 1")
      .get(workspaceId) as SessionRow | undefined;
    return row ? toSession(row) : null;
  };

  const persistActiveContext = (context: LocalContext) => {
    writeMeta("active_profile_id", context.profile.id);
    writeMeta("active_workspace_id", context.workspace.id);
    writeMeta("active_session_id", context.session.id);
    writeMeta("schema_version", SCHEMA_VERSION);
  };

  const contextFromParts = (profile: LocalProfile, workspace: LocalWorkspace, session: LocalSession): LocalContext => {
    const context = { profile, workspace, session };
    persistActiveContext(context);
    return context;
  };

  const getActiveContext = (): LocalContext => {
    let profile = getProfile(readMeta("active_profile_id"));
    if (!profile) {
      profile = createProfile();
      writeMeta("active_profile_id", profile.id);
    }

    let workspace = getWorkspace(readMeta("active_workspace_id"));
    if (!workspace || workspace.profileId !== profile.id) {
      workspace = createWorkspace(profile.id);
      writeMeta("active_workspace_id", workspace.id);
    }

    let session = getSession(readMeta("active_session_id"));
    if (!session || session.workspaceId !== workspace.id) {
      session = createSession(workspace.id);
    }

    writeMeta("schema_version", SCHEMA_VERSION);
    return { profile, workspace, session };
  };

  const listProfiles = () => {
    const rows = db
      .prepare("SELECT * FROM profiles ORDER BY updated_at DESC, created_at DESC, name ASC")
      .all() as ProfileRow[];
    return rows.map(toProfile);
  };

  const updateProfile = (id: string, name: string) => {
    const profile = getProfile(id);
    if (!profile) {
      throw new Error("Profile was not found.");
    }

    const updatedAt = nowIso();
    const nextName = normalizeName(name, profile.name || DEFAULT_PROFILE_NAME);
    db.prepare("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?").run(nextName, updatedAt, profile.id);
    return { ...profile, name: nextName, updatedAt };
  };

  const loadProfile = (profileId: string): LocalContext => {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error("Profile was not found.");
    }

    let workspace = latestWorkspaceForProfile(profile.id);
    if (!workspace) {
      workspace = createWorkspace(profile.id);
    }

    let session = latestSessionForWorkspace(workspace.id);
    if (!session) {
      session = createSession(workspace.id);
    }

    return contextFromParts(profile, workspace, session);
  };

  const createProfileContext = (name?: string): LocalContext => {
    const profile = createProfile(name);
    const workspace = createWorkspace(profile.id);
    const session = createSession(workspace.id);
    return contextFromParts(profile, workspace, session);
  };

  const listSessions = (profileId: string) => {
    const rows = db
      .prepare(
        `
        SELECT
          sessions.*,
          (
            SELECT COUNT(*)
            FROM captures
            WHERE captures.session_id = sessions.id
          ) AS capture_count,
          (
            SELECT COUNT(*)
            FROM ssl_events
            WHERE ssl_events.session_id = sessions.id
          ) AS ssl_event_count
        FROM sessions
        INNER JOIN workspaces ON workspaces.id = sessions.workspace_id
        WHERE workspaces.profile_id = ?
        ORDER BY sessions.updated_at DESC, sessions.started_at DESC
      `
      )
      .all(profileId) as SessionSummaryRow[];
    return rows.map(toSessionSummary);
  };

  const loadSession = (sessionId: string): LocalContext => {
    const session = getSession(sessionId);
    if (!session) {
      throw new Error("Session was not found.");
    }

    const workspace = getWorkspace(session.workspaceId);
    if (!workspace) {
      throw new Error("Session workspace was not found.");
    }

    const profile = getProfile(workspace.profileId);
    if (!profile) {
      throw new Error("Session profile was not found.");
    }

    return contextFromParts(profile, workspace, session);
  };

  const updateSession = (id: string, name: string) => {
    const session = getSession(id);
    if (!session) {
      throw new Error("Session was not found.");
    }

    const updatedAt = nowIso();
    const nextName = normalizeName(name, session.name || defaultSessionName(session.startedAt));
    db.prepare("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?").run(nextName, updatedAt, session.id);
    return { ...session, name: nextName, updatedAt };
  };


  const {
    listProjectNotes,
    upsertProjectNote,
    deleteProjectNote,
    listSavedViews,
    upsertSavedView,
    deleteSavedView,
    listAgentRunMemory,
    upsertAgentRunMemory,
    deleteAgentRunMemory
  } = createProjectArtifactsRepository(db);

  const requireWorkspace = (workspaceId: string) => {
    const row = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId) as { id: string } | undefined;
    if (!row) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return row.id;
  };

  const requireSessionWorkspace = (sessionId: string) => {
    const row = db.prepare("SELECT workspace_id FROM sessions WHERE id = ?").get(sessionId) as
      | { workspace_id: string }
      | undefined;
    if (!row) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return row.workspace_id;
  };

  const {
    listIdentityProfiles,
    getIdentityProfile,
    upsertIdentityProfile,
    archiveIdentityProfile,
    listIdentityActivations,
    upsertIdentityActivation
  } = createIdentityRepository(db, { requireWorkspace, requireSessionWorkspace });

  const {
    getReplayTabState,
    setReplayTabState,
    listReplayEnvironments,
    setReplayEnvironments,
    listReplayCollections,
    setReplayCollections
  } = createRepeaterRepository(db);

  const {
    listAutomatePayloadSets,
    setAutomatePayloadSets,
    listAutomateSessions,
    getAutomateSession,
    upsertAutomateSession
  } = createAutomateRepository(db);

  const {
    listWorkflowDefinitions,
    setWorkflowDefinitions,
    listWorkflowRevisions,
    appendWorkflowRevision,
    upsertWorkflowDefinition,
    deleteWorkflowDefinition,
    listWorkflowRuns,
    getWorkflowRun,
    upsertWorkflowRun
  } = createWorkflowsRepository(db);

  const {
    listPlugins,
    getPlugin,
    upsertPlugin,
    approvePlugin,
    setPluginStatus,
    deletePlugin,
    listPluginAudit,
    appendPluginAudit
  } = createPluginsRepository(db);


  const {
    listEvidenceAnnotations,
    saveEvidenceAnnotation,
    saveEvidenceAnnotations
  } = createEvidenceAnnotationsRepository(db);

  const {
    listFindings,
    upsertFinding,
    deleteFinding
  } = createFindingsRepository(db);


  const {
    upsertCapture,
    listCaptures,
    clearCaptures,
    deleteCapture,
    insertSslEvent,
    listSslEvents,
    insertWebSocketEvent,
    listWebSocketEvents,
    clearWebSocketEvents
  } = createEvidenceRepository(db);

  const {
    saveAiModels,
    listAiModels
  } = createAiModelsRepository(db);

  const {
    upsertAgentRun,
    getAgentRun,
    listAgentRuns
  } = createAgentRunsRepository(db);

  const close = () => {
    db.close();
  };

  return {
    getActiveContext,
    listProfiles,
    createProfileContext,
    updateProfile,
    loadProfile,
    listSessions,
    createSession,
    updateSession,
    loadSession,
    getTargets,
    setTargets,
    listInterceptRules,
    setInterceptRules,
    listMatchReplaceRules,
    setMatchReplaceRules,
    listProxyProfiles,
    saveProxyProfile,
    listSavedFilters,
    setSavedFilters,
    listProjectNotes,
    upsertProjectNote,
    deleteProjectNote,
    listSavedViews,
    upsertSavedView,
    deleteSavedView,
    listAgentRunMemory,
    upsertAgentRunMemory,
    deleteAgentRunMemory,
    listIdentityProfiles,
    getIdentityProfile,
    upsertIdentityProfile,
    archiveIdentityProfile,
    listIdentityActivations,
    upsertIdentityActivation,
    getReplayTabState,
    setReplayTabState,
    listReplayEnvironments,
    setReplayEnvironments,
    listReplayCollections,
    setReplayCollections,
    listAutomatePayloadSets,
    setAutomatePayloadSets,
    listWorkflowDefinitions,
    setWorkflowDefinitions,
    listWorkflowRevisions,
    appendWorkflowRevision,
    upsertWorkflowDefinition,
    deleteWorkflowDefinition,
    listPlugins,
    getPlugin,
    upsertPlugin,
    approvePlugin,
    setPluginStatus,
    deletePlugin,
    listPluginAudit,
    appendPluginAudit,
    listAutomateSessions,
    getAutomateSession,
    upsertAutomateSession,
    listEvidenceAnnotations,
    saveEvidenceAnnotation,
    saveEvidenceAnnotations,
    listFindings,
    upsertFinding,
    deleteFinding,
    listWorkflowRuns,
    getWorkflowRun,
    upsertWorkflowRun,
    upsertCapture,
    listCaptures,
    deleteCapture,
    clearCaptures,
    insertSslEvent,
    listSslEvents,
    insertWebSocketEvent,
    listWebSocketEvents,
    clearWebSocketEvents,
    saveAiModels,
    listAiModels,
    upsertAgentRun,
    getAgentRun,
    listAgentRuns,
    close
  };
}
