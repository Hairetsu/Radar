import {
  normalizeIdentityActivation,
  normalizeIdentityProfile,
  type IdentityActivationRecord,
  type IdentityProfile
} from "../../../shared/identityProfiles.js";
import { parseJsonObject } from "../json.js";
import type { IdentityActivationRow, IdentityProfileRow } from "../rows.js";

export function toIdentityProfile(row: IdentityProfileRow): IdentityProfile {
  const profile = normalizeIdentityProfile(parseJsonObject(row.profile_json, null));
  if (!profile || profile.id !== row.id || profile.workspaceId !== row.workspace_id) {
    throw new Error(`Stored identity profile is invalid: ${row.id}`);
  }
  return profile;
}

export function toIdentityActivation(row: IdentityActivationRow): IdentityActivationRecord {
  const activation = normalizeIdentityActivation(parseJsonObject(row.activation_json, null));
  if (
    !activation ||
    activation.id !== row.id ||
    activation.sessionId !== row.session_id ||
    activation.workspaceId !== row.workspace_id ||
    activation.identityId !== row.identity_id
  ) {
    throw new Error(`Stored identity activation is invalid: ${row.id}`);
  }
  return activation;
}
