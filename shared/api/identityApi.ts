import type {
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft
} from "../identityProfiles.js";

export type IdentityApi = {
  listIdentityProfiles: () => Promise<IdentityProfile[]>;
  createIdentityProfile: (
    draft: IdentityProfileDraft
  ) => Promise<IdentityProfile>;
  updateIdentityProfile: (payload: {
    id: string;
    draft: Partial<IdentityProfileDraft>;
  }) => Promise<IdentityProfile>;
  activateIdentityProfile: (payload: {
    identityId: string;
    url?: string;
  }) => Promise<{
    identity: IdentityProfile;
    activation: IdentityActivationRecord;
    url: string;
  }>;
  verifyIdentityProfile: (id: string) => Promise<IdentityProfile>;
  archiveIdentityProfile: (
    id: string
  ) => Promise<{ ok: boolean; identities: IdentityProfile[] }>;
  listIdentityActivations: () => Promise<IdentityActivationRecord[]>;
};
