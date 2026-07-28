import { createHash, randomUUID } from "node:crypto";
import { isAllowedTarget } from "../../shared/allowlist.js";
import type {
  AgentStorageState
} from "../../shared/agent-types.js";
import type {
  CapturedRequest,
  LocalContext
} from "../../shared/domain.js";
import {
  normalizeIdentityProfile,
  type IdentityActivationRecord,
  type IdentityProfile,
  type IdentityProfileDraft
} from "../../shared/identityProfiles.js";
import type { LocalStore } from "../localStore.js";

type CdpCommand = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

type IdentityControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  allowlist: () => string[];
  getStorageState: () => Promise<AgentStorageState>;
  activateBrowser: (
    identityId: string,
    startUrl: string
  ) => Promise<{ activationId: string; activatedAt: string }>;
  waitForNetworkIdle: (input: {
    idleMs?: number;
    timeoutMs?: number;
  }) => Promise<{ idle: boolean; waitedMs: number }>;
  getPageText: () => Promise<{
    url: string;
    title: string;
    text: string;
  }>;
  browserInstanceId: () => string;
  activeActionId: () => string;
  setActiveActionId: (id: string) => void;
  setActiveNavigationId: (id: string) => void;
  activeIdentityId: () => string;
  activeActivationId: () => string;
  endActivation: () => void;
  stopBrowser: () => void;
  withCdpPage: <T>(
    callback: (sendCommand: CdpCommand) => Promise<T>
  ) => Promise<T>;
  listCaptures: (limit: number) => CapturedRequest[];
};

function sortedIdentityState(state: AgentStorageState) {
  const sortedRecord = (value: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
  return {
    origin: state.origin,
    cookies: [...state.cookies]
      .map((cookie) => ({ ...cookie }))
      .sort((left, right) =>
        `${left.domain || ""}\n${left.path || ""}\n${
          left.name
        }`.localeCompare(
          `${right.domain || ""}\n${right.path || ""}\n${
            right.name
          }`
        )
      ),
    localStorage: sortedRecord(state.localStorage),
    sessionStorage: sortedRecord(state.sessionStorage)
  };
}

export function createIdentityController(
  deps: IdentityControllerDeps
) {
  function list() {
    const context = deps.context();
    return deps.store().listIdentityProfiles(context.workspace.id);
  }

  function normalizeDraft(
    draft: IdentityProfileDraft | Partial<IdentityProfileDraft>,
    existing?: IdentityProfile
  ) {
    const context = deps.context();
    const now = new Date().toISOString();
    const raw =
      draft && typeof draft === "object"
        ? draft
        : ({} as Partial<IdentityProfileDraft>);
    const profile = normalizeIdentityProfile({
      ...(existing || {}),
      id: existing?.id || `identity_${randomUUID()}`,
      workspaceId: context.workspace.id,
      label: raw.label ?? existing?.label,
      kind: raw.kind ?? existing?.kind,
      roleLabel: raw.roleLabel ?? existing?.roleLabel,
      tenantLabel: raw.tenantLabel ?? existing?.tenantLabel,
      origin: raw.origin ?? existing?.origin,
      notes: raw.notes ?? existing?.notes,
      isolation: existing?.isolation || "dedicated-profile",
      health: existing?.health || "unknown",
      refreshMode:
        raw.refreshMode ?? existing?.refreshMode ?? "manual",
      refreshWorkflowId:
        raw.refreshWorkflowId ?? existing?.refreshWorkflowId,
      maxHealthAgeMs:
        raw.maxHealthAgeMs ?? existing?.maxHealthAgeMs,
      jarRevision: existing?.jarRevision || 0,
      containerId:
        existing?.containerId ||
        `container-${existing?.id || "new"}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastActivatedAt: existing?.lastActivatedAt,
      lastCheckedAt: existing?.lastCheckedAt,
      lastEvidenceRef: existing?.lastEvidenceRef,
      authFingerprint: existing?.authFingerprint,
      archivedAt: existing?.archivedAt
    });
    if (!profile) {
      throw new Error("Identity profile metadata is invalid.");
    }
    if (!isAllowedTarget(profile.origin, deps.allowlist())) {
      throw new Error(
        `Identity origin is outside the current saved Scope: ${profile.origin}`
      );
    }
    if (!existing) {
      profile.containerId = `container-${profile.id}`;
    }
    return profile;
  }

  function create(draft: IdentityProfileDraft) {
    const profile = normalizeDraft(draft);
    return deps
      .store()
      .upsertIdentityProfile(profile.workspaceId, profile);
  }

  function update(payload: {
    id: string;
    draft: Partial<IdentityProfileDraft>;
  }) {
    const context = deps.context();
    const store = deps.store();
    const existing = store.getIdentityProfile(
      context.workspace.id,
      String(payload?.id || "")
    );
    if (!existing || existing.archivedAt) {
      throw new Error(
        "Identity profile was not found in this workspace."
      );
    }
    return store.upsertIdentityProfile(
      context.workspace.id,
      normalizeDraft(payload?.draft || {}, existing)
    );
  }

  async function currentFingerprint() {
    return createHash("sha256")
      .update(
        JSON.stringify(
          sortedIdentityState(await deps.getStorageState())
        )
      )
      .digest("hex");
  }

  async function activate({ identityId }: { identityId: string }) {
    const context = deps.context();
    const store = deps.store();
    const identity = store.getIdentityProfile(
      context.workspace.id,
      String(identityId || "")
    );
    if (!identity || identity.archivedAt) {
      throw new Error(
        "Identity profile was not found in this workspace."
      );
    }
    if (identity.isolation !== "dedicated-profile") {
      throw new Error(
        "Only dedicated-profile identities can be activated as isolated browser contexts."
      );
    }
    if (!isAllowedTarget(identity.origin, deps.allowlist())) {
      throw new Error(
        `Identity origin is outside the current saved Scope: ${identity.origin}`
      );
    }
    const inheritedActionId = deps.activeActionId();
    const prior = store
      .listIdentityActivations(context.session.id, 100)
      .find((item) => item.status === "active");
    if (prior) {
      store.upsertIdentityActivation(context.session.id, {
        ...prior,
        status: "ended",
        endedAt: new Date().toISOString()
      });
    }

    try {
      const activated = await deps.activateBrowser(
        identity.id,
        identity.origin
      );
      const settled = await deps.waitForNetworkIdle({
        idleMs: 500,
        timeoutMs: 5_000
      });
      if (!settled.idle) {
        throw new Error(
          "Identity activation did not reach a bounded network-idle checkpoint."
        );
      }
      const fingerprint = await currentFingerprint();
      const page = await deps.getPageText();
      if (!isAllowedTarget(page.url, deps.allowlist())) {
        throw new Error(
          `Identity activation redirected outside saved Scope: ${page.url}`
        );
      }
      const activation: IdentityActivationRecord = {
        id: activated.activationId,
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
        identityId: identity.id,
        startedAt: activated.activatedAt,
        status: "active",
        browserInstanceId:
          deps.browserInstanceId() || `browser_${randomUUID()}`,
        authFingerprint: fingerprint
      };
      store.upsertIdentityActivation(context.session.id, activation);
      const changed = fingerprint !== identity.authFingerprint;
      const nextIdentity = store.upsertIdentityProfile(
        context.workspace.id,
        {
          ...identity,
          authFingerprint: fingerprint,
          jarRevision: identity.jarRevision + (changed ? 1 : 0),
          lastActivatedAt: activated.activatedAt,
          updatedAt: activated.activatedAt
        }
      );
      if (!inheritedActionId) {
        deps.setActiveActionId("");
      }
      deps.setActiveNavigationId("");
      return { identity: nextIdentity, activation, url: page.url };
    } catch (error) {
      deps.endActivation();
      deps.stopBrowser();
      throw error;
    }
  }

  async function verify({ identityId }: { identityId: string }) {
    const { identity, activation } = await activate({ identityId });
    if (!deps.activeActionId()) {
      deps.setActiveActionId(`action_${randomUUID()}`);
    }
    deps.setActiveNavigationId(`nav_${randomUUID()}`);
    try {
      await deps.withCdpPage(async (sendCommand) => {
        await sendCommand("Page.reload", { ignoreCache: false });
      });
      await deps.waitForNetworkIdle({
        idleMs: 700,
        timeoutMs: 8_000
      });
      const page = await deps.getPageText();
      if (!isAllowedTarget(page.url, deps.allowlist())) {
        throw new Error(
          `Identity verification redirected outside saved Scope: ${page.url}`
        );
      }
      const scoped = deps
        .listCaptures(400)
        .filter(
          (capture) =>
            capture.identityId === identity.id &&
            capture.activationId === activation.id &&
            (() => {
              try {
                return (
                  new URL(capture.url).origin === identity.origin
                );
              } catch {
                return false;
              }
            })()
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt)
        );
      const primary =
        scoped.find((capture) => capture.type === "Document") ||
        scoped[0];
      const now = new Date().toISOString();
      const health =
        primary?.status === 401 || primary?.status === 403
          ? "expired"
          : primary?.status &&
              primary.status >= 200 &&
              primary.status < 400
            ? "healthy"
            : primary
              ? "stale"
              : "error";
      return deps
        .store()
        .upsertIdentityProfile(identity.workspaceId, {
          ...identity,
          health,
          lastCheckedAt: now,
          lastEvidenceRef: primary
            ? `capture:${primary.id}`
            : undefined,
          updatedAt: now
        });
    } finally {
      deps.setActiveActionId("");
      deps.setActiveNavigationId("");
    }
  }

  function archive(identityId: string) {
    const context = deps.context();
    const store = deps.store();
    const identity = store.getIdentityProfile(
      context.workspace.id,
      String(identityId || "")
    );
    if (!identity) {
      throw new Error(
        "Identity profile was not found in this workspace."
      );
    }
    if (deps.activeIdentityId() === identity.id) {
      deps.endActivation();
      deps.stopBrowser();
    }
    store.archiveIdentityProfile(context.workspace.id, identity.id);
    return { ok: true, identities: list() };
  }

  function labContext() {
    return {
      identities: list(),
      activeIdentityId: deps.activeIdentityId() || undefined,
      activeActivationId: deps.activeActivationId() || undefined,
      attributedCaptureCount: deps
        .listCaptures(2_000)
        .filter(
          (capture) =>
            capture.identityId && capture.activationId
        ).length
    };
  }

  return {
    list,
    create,
    update,
    activate,
    verify,
    archive,
    labContext,
    currentFingerprint
  };
}
