import type { DatabaseSync } from "node:sqlite";
import {
  MAX_IDENTITY_PROFILES,
  normalizeIdentityActivation,
  normalizeIdentityProfile,
  type IdentityActivationRecord,
  type IdentityProfile
} from "../../../shared/identityProfiles.js";
import { toIdentityActivation, toIdentityProfile } from "../rowMappers/identity.js";
import type { IdentityActivationRow, IdentityProfileRow } from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

const MAX_IDENTITY_ACTIVATIONS = 500;

type IdentityRepositoryDependencies = {
  requireWorkspace: (workspaceId: string) => string;
  requireSessionWorkspace: (sessionId: string) => string;
};

function nowIso() {
  return new Date().toISOString();
}

export function createIdentityRepository(
  db: DatabaseSync,
  dependencies: IdentityRepositoryDependencies
) {
  const { requireWorkspace, requireSessionWorkspace } = dependencies;
  const identityProfileRowById = (identityId: string) =>
    db
      .prepare("SELECT id, workspace_id, updated_at, archived_at, profile_json FROM workspace_identity_profiles WHERE id = ?")
      .get(identityId) as IdentityProfileRow | undefined;

  const listIdentityProfiles = (
    workspaceId: string,
    options: { includeArchived?: boolean } = {}
  ): IdentityProfile[] => {
    requireWorkspace(workspaceId);
    const rows = options.includeArchived
      ? (db
          .prepare(`
            SELECT id, workspace_id, updated_at, archived_at, profile_json
            FROM workspace_identity_profiles
            WHERE workspace_id = ?
            ORDER BY archived_at IS NOT NULL ASC, updated_at DESC, id ASC
            LIMIT ?
          `)
          .all(workspaceId, MAX_IDENTITY_PROFILES) as IdentityProfileRow[])
      : (db
          .prepare(`
            SELECT id, workspace_id, updated_at, archived_at, profile_json
            FROM workspace_identity_profiles
            WHERE workspace_id = ? AND archived_at IS NULL
            ORDER BY updated_at DESC, id ASC
            LIMIT ?
          `)
          .all(workspaceId, MAX_IDENTITY_PROFILES) as IdentityProfileRow[]);
    return rows.map(toIdentityProfile);
  };

  const getIdentityProfile = (workspaceId: string, identityId: string) => {
    requireWorkspace(workspaceId);
    const row = identityProfileRowById(identityId);
    if (!row) {
      return null;
    }
    if (row.workspace_id !== workspaceId) {
      throw new Error(`Identity profile ${identityId} does not belong to workspace ${workspaceId}.`);
    }
    return toIdentityProfile(row);
  };

  const upsertIdentityProfile = (workspaceId: string, input: IdentityProfile) => {
    requireWorkspace(workspaceId);
    const normalized = normalizeIdentityProfile(input);
    if (!normalized) {
      throw new Error("Identity profile was invalid.");
    }
    if (normalized.workspaceId !== workspaceId) {
      throw new Error(`Identity profile ${normalized.id} does not belong to workspace ${workspaceId}.`);
    }

    const existingRow = identityProfileRowById(normalized.id);
    if (existingRow && existingRow.workspace_id !== workspaceId) {
      throw new Error(`Identity profile ${normalized.id} already belongs to another workspace.`);
    }
    const existing = existingRow ? toIdentityProfile(existingRow) : null;
    if (existing && Date.parse(normalized.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new Error(`Identity profile ${normalized.id} update is older than the stored revision.`);
    }
    if (existing && normalized.jarRevision < existing.jarRevision) {
      throw new Error(`Identity profile ${normalized.id} jar revision cannot decrease.`);
    }

    const profile = normalizeIdentityProfile({
      ...normalized,
      createdAt: existing?.createdAt || normalized.createdAt,
      containerId: existing?.containerId || normalized.containerId,
      archivedAt: existing?.archivedAt || normalized.archivedAt
    });
    if (!profile) {
      throw new Error("Identity profile was invalid after normalization.");
    }

    runImmediateTransaction(db, () => {
      if (!existing) {
        const count = db
          .prepare("SELECT COUNT(*) AS count FROM workspace_identity_profiles WHERE workspace_id = ?")
          .get(workspaceId) as { count: number };
        if (Number(count.count) >= MAX_IDENTITY_PROFILES) {
          throw new Error(`Identity profile limit reached for workspace ${workspaceId}.`);
        }
      }
      db.prepare(`
        INSERT INTO workspace_identity_profiles (workspace_id, id, updated_at, archived_at, profile_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at,
          profile_json = excluded.profile_json
      `).run(
        workspaceId,
        profile.id,
        profile.updatedAt,
        profile.archivedAt ?? null,
        JSON.stringify(profile)
      );
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(profile.updatedAt, workspaceId);
    });
    return profile;
  };

  const archiveIdentityProfile = (workspaceId: string, identityId: string, archivedAt = nowIso()) => {
    const existing = getIdentityProfile(workspaceId, identityId);
    if (!existing) {
      throw new Error(`Identity profile not found: ${identityId}`);
    }
    if (existing.archivedAt) {
      return existing;
    }
    if (!Number.isFinite(Date.parse(archivedAt))) {
      throw new Error("Identity archive timestamp was invalid.");
    }
    const timestamp = new Date(archivedAt).toISOString();
    const archived = normalizeIdentityProfile({
      ...existing,
      updatedAt: timestamp,
      archivedAt: timestamp
    });
    if (!archived) {
      throw new Error("Identity profile could not be archived.");
    }
    return upsertIdentityProfile(workspaceId, archived);
  };

  const activationRowById = (activationId: string) =>
    db
      .prepare(`
        SELECT id, session_id, workspace_id, identity_id, started_at, updated_at, activation_json
        FROM session_identity_activations
        WHERE id = ?
      `)
      .get(activationId) as IdentityActivationRow | undefined;

  const listIdentityActivations = (sessionId: string, limit = 100): IdentityActivationRecord[] => {
    const workspaceId = requireSessionWorkspace(sessionId);
    const rows = db
      .prepare(`
        SELECT id, session_id, workspace_id, identity_id, started_at, updated_at, activation_json
        FROM session_identity_activations
        WHERE session_id = ?
        ORDER BY started_at DESC, id DESC
        LIMIT ?
      `)
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 100, MAX_IDENTITY_ACTIVATIONS))) as IdentityActivationRow[];
    return rows.map((row) => {
      if (row.workspace_id !== workspaceId) {
        throw new Error(`Stored identity activation ${row.id} does not belong to session workspace ${workspaceId}.`);
      }
      return toIdentityActivation(row);
    });
  };

  const upsertIdentityActivation = (sessionId: string, input: IdentityActivationRecord) => {
    const workspaceId = requireSessionWorkspace(sessionId);
    const normalized = normalizeIdentityActivation(input);
    if (!normalized) {
      throw new Error("Identity activation was invalid.");
    }
    if (normalized.sessionId !== sessionId || normalized.workspaceId !== workspaceId) {
      throw new Error(`Identity activation ${normalized.id} does not belong to session ${sessionId}.`);
    }

    const profileRow = identityProfileRowById(normalized.identityId);
    if (!profileRow || profileRow.workspace_id !== workspaceId) {
      throw new Error(`Identity profile ${normalized.identityId} does not belong to session workspace ${workspaceId}.`);
    }
    const existingRow = activationRowById(normalized.id);
    if (existingRow && existingRow.session_id !== sessionId) {
      throw new Error(`Identity activation ${normalized.id} already belongs to another session.`);
    }
    const existing = existingRow ? toIdentityActivation(existingRow) : null;
    if (!existing && profileRow.archived_at) {
      throw new Error(`Archived identity profile cannot be activated: ${normalized.identityId}`);
    }
    if (
      existing &&
      (existing.workspaceId !== normalized.workspaceId ||
        existing.identityId !== normalized.identityId ||
        existing.startedAt !== normalized.startedAt ||
        existing.browserInstanceId !== normalized.browserInstanceId)
    ) {
      throw new Error(`Identity activation ${normalized.id} immutable fields cannot change.`);
    }
    if (existing?.authFingerprint && normalized.authFingerprint && existing.authFingerprint !== normalized.authFingerprint) {
      throw new Error(`Identity activation ${normalized.id} auth fingerprint cannot change.`);
    }
    if (normalized.endedAt && Date.parse(normalized.endedAt) < Date.parse(normalized.startedAt)) {
      throw new Error(`Identity activation ${normalized.id} ended before it started.`);
    }
    if (existing?.endedAt && normalized.endedAt && existing.endedAt !== normalized.endedAt) {
      throw new Error(`Identity activation ${normalized.id} end timestamp cannot change.`);
    }
    const allowedTransitions: Record<
      IdentityActivationRecord["status"],
      IdentityActivationRecord["status"][]
    > = {
      starting: ["starting", "active", "failed"],
      active: ["active", "ended", "failed"],
      ended: ["ended"],
      failed: ["failed"]
    };
    if (existing && !allowedTransitions[existing.status].includes(normalized.status)) {
      throw new Error(`Identity activation ${normalized.id} cannot transition from ${existing.status} to ${normalized.status}.`);
    }

    const activation = normalizeIdentityActivation({
      ...normalized,
      authFingerprint: normalized.authFingerprint || existing?.authFingerprint,
      endedAt: normalized.endedAt || existing?.endedAt,
      error: normalized.error || existing?.error
    });
    if (!activation) {
      throw new Error("Identity activation was invalid after normalization.");
    }

    const updatedAt = nowIso();
    runImmediateTransaction(db, () => {
      if (!existing) {
        const count = db
          .prepare("SELECT COUNT(*) AS count FROM session_identity_activations WHERE session_id = ?")
          .get(sessionId) as { count: number };
        if (Number(count.count) >= MAX_IDENTITY_ACTIVATIONS) {
          throw new Error(`Identity activation limit reached for session ${sessionId}.`);
        }
      }
      db.prepare(`
        INSERT INTO session_identity_activations (
          session_id, id, workspace_id, identity_id, started_at, updated_at, activation_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          activation_json = excluded.activation_json
      `).run(
        sessionId,
        activation.id,
        workspaceId,
        activation.identityId,
        activation.startedAt,
        updatedAt,
        JSON.stringify(activation)
      );
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(updatedAt, sessionId);
    });
    return activation;
  };
  return {
    listIdentityProfiles,
    getIdentityProfile,
    upsertIdentityProfile,
    archiveIdentityProfile,
    listIdentityActivations,
    upsertIdentityActivation
  };
}

