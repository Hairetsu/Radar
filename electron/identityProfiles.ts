import path from "node:path";
import { randomUUID } from "node:crypto";

const ID_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export type IdentityActivation = {
  identityId: string;
  activationId: string;
  activatedAt: string;
  profileDir: string;
};

export function assertIdentityPathSegment(value: string, label: string) {
  const next = String(value || "").trim();
  if (!ID_SEGMENT.test(next)) {
    throw new Error(`${label} is invalid.`);
  }
  return next;
}

export function identityBrowserProfileDir(userDataDir: string, profileId: string, identityId: string) {
  const safeProfileId = assertIdentityPathSegment(profileId, "Profile ID");
  const safeIdentityId = assertIdentityPathSegment(identityId, "Identity ID");
  return path.join(userDataDir, "profiles", safeProfileId, "identities", safeIdentityId, "browser-profile");
}

export function createIdentityActivation(
  profileDir: string,
  identityId: string,
  now = new Date().toISOString(),
  activationId = `activation_${randomUUID()}`
): IdentityActivation {
  return {
    identityId: assertIdentityPathSegment(identityId, "Identity ID"),
    activationId: assertIdentityPathSegment(activationId, "Activation ID"),
    activatedAt: now,
    profileDir: path.resolve(profileDir)
  };
}

export function createSerializedIdentityActivator() {
  let tail = Promise.resolve();
  return async function activate<T>(task: () => Promise<T>) {
    const prior = tail;
    let release: () => void = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
