import type {
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  LocalWorkspace
} from "../../../shared/domain.js";
import type {
  ProfileRow,
  SessionRow,
  SessionSummaryRow,
  WorkspaceRow
} from "../rows.js";

export function toProfile(row: ProfileRow): LocalProfile {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toWorkspace(row: WorkspaceRow): LocalWorkspace {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSession(row: SessionRow): LocalSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    startedAt: row.started_at,
    updatedAt: row.updated_at
  };
}

export function toSessionSummary(row: SessionSummaryRow): LocalSessionSummary {
  return {
    ...toSession(row),
    captureCount: Number(row.capture_count || 0),
    sslEventCount: Number(row.ssl_event_count || 0)
  };
}
