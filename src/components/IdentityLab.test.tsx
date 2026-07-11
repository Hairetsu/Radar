// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { IdentityProfile } from "../../shared/identityProfiles.js";
import type { CapturedRequest } from "../types";
import { IdentityLab } from "./IdentityLab";

const WORKSPACE_ID = "workspace-acme";

function identity(id: string, overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    label: `Identity ${id}`,
    kind: "user",
    roleLabel: "member",
    tenantLabel: "tenant-a",
    origin: "https://target.test",
    notes: "",
    isolation: "dedicated-profile",
    health: "healthy",
    refreshMode: "manual",
    jarRevision: 1,
    containerId: `container-${id}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
    ...overrides
  };
}

function capture(id: string, url: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  const parsed = new URL(url);
  return {
    id,
    startedAt: "2026-07-10T12:00:01.000Z",
    method: "GET",
    url,
    host: parsed.host,
    path: parsed.pathname,
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: {},
    responseBody: "{\"id\":41}",
    durationMs: 24,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

function handlers() {
  return {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onActivate: vi.fn(),
    onVerify: vi.fn(),
    onArchive: vi.fn()
  };
}

describe("IdentityLab", () => {
  it("creates a constrained dedicated identity draft", async () => {
    const callbacks = handlers();
    const user = userEvent.setup();
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[]} captures={[]} {...callbacks} />);

    await user.type(screen.getByLabelText("Identity label"), "Tenant A operator");
    await user.selectOptions(screen.getByLabelText("Kind"), "admin");
    await user.type(screen.getByLabelText("Role"), "billing-admin");
    await user.type(screen.getByLabelText("Tenant"), "tenant-a");
    await user.type(screen.getByLabelText("Target origin"), "https://target.test/account");
    await user.type(screen.getByLabelText("Operator notes"), "Captured through a dedicated browser profile.");
    await user.click(screen.getByRole("button", { name: "Create identity" }));

    await waitFor(() => expect(callbacks.onCreate).toHaveBeenCalledTimes(1));
    expect(callbacks.onCreate).toHaveBeenCalledWith({
      label: "Tenant A operator",
      kind: "admin",
      roleLabel: "billing-admin",
      tenantLabel: "tenant-a",
      origin: "https://target.test",
      notes: "Captured through a dedicated browser profile.",
      refreshMode: "manual"
    });
    expect(screen.getByText("DEDICATED PROFILE · default")).toBeInTheDocument();
  });

  it("activates and archives identities through explicit operator controls", async () => {
    const callbacks = handlers();
    const profile = identity("user-a", { label: "Tenant A user" });
    const user = userEvent.setup();
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[profile]} captures={[]} {...callbacks} />);

    await user.click(screen.getByRole("button", { name: "Activate Tenant A user" }));
    await user.click(screen.getByRole("button", { name: "Archive Tenant A user" }));

    expect(callbacks.onActivate).toHaveBeenCalledWith("user-a");
    expect(callbacks.onArchive).toHaveBeenCalledWith("user-a");
  });

  it("builds matrix rows only from known identity and activation attribution", () => {
    const callbacks = handlers();
    const profile = identity("user-a", { label: "Tenant A user" });
    const captures = [
      capture("attributed", "https://target.test/api/invoices/41", {
        identityId: profile.id,
        activationId: "activation-a"
      }),
      capture("missing-activation", "https://target.test/api/invoices/42", {
        identityId: profile.id,
        status: 403
      }),
      capture("unknown-identity", "https://target.test/api/admin/health", {
        identityId: "not-in-workspace",
        activationId: "activation-unknown"
      })
    ];
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[profile]} captures={captures} {...callbacks} />);

    const matrix = screen.getByTestId("identityMatrix");
    expect(within(matrix).getByText("GET target.test/api/invoices/:id")).toBeInTheDocument();
    expect(within(matrix).getByText("1 CAPTURE")).toBeInTheDocument();
    expect(within(matrix).queryByText(/admin\/health/)).not.toBeInTheDocument();
    expect(screen.getByText("2 EXCLUDED")).toBeInTheDocument();
    expect(within(matrix).getByText("2xx response observed; not authorization proof.")).toBeInTheDocument();
  });

  it("warns when an identity uses snapshot-only isolation and labels health explicitly", () => {
    const callbacks = handlers();
    const profile = identity("snapshot-user", {
      label: "Imported cookie snapshot",
      isolation: "snapshot-only",
      health: "stale"
    });
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[profile]} captures={[]} {...callbacks} />);

    expect(screen.getByTestId("snapshotIsolationWarning")).toHaveTextContent("Snapshot-only isolation");
    expect(screen.getByText("SNAPSHOT ONLY")).toBeInTheDocument();
    expect(screen.getByText("HEALTH: STALE")).toBeInTheDocument();
  });

  it("blocks a differential when no recorded request changes only identity", async () => {
    const callbacks = handlers();
    const firstIdentity = identity("user-a", { label: "Tenant A user" });
    const secondIdentity = identity("user-b", { label: "Tenant B user", tenantLabel: "tenant-b" });
    const captures = [
      capture("capture-left", "https://target.test/api/invoices/41", {
        identityId: firstIdentity.id,
        activationId: "activation-a"
      }),
      capture("capture-wrong-target", "https://target.test/api/invoices/42", {
        identityId: secondIdentity.id,
        activationId: "activation-b",
        status: 403
      })
    ];
    const user = userEvent.setup();
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[firstIdentity, secondIdentity]} captures={captures} {...callbacks} />);

    expect(screen.getByText(/Recorded evidence only · no traffic is sent/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("First recorded request"), "capture-left");

    expect(screen.getByTestId("identityComparisonState")).toHaveTextContent(
      "Comparison blocked: no already-recorded request changes only the identity dimension."
    );
    expect(screen.getByLabelText("Matching recorded request")).toBeDisabled();
  });

  it("compares matching recorded responses without drawing an authorization conclusion", async () => {
    const callbacks = handlers();
    const firstIdentity = identity("user-a", { label: "Tenant A user" });
    const secondIdentity = identity("admin-a", { label: "Tenant A admin", kind: "admin", roleLabel: "admin" });
    const captures = [
      capture("capture-left", "https://target.test/api/invoices/41?view=full", {
        identityId: firstIdentity.id,
        activationId: "activation-a"
      }),
      capture("capture-right", "https://target.test/api/invoices/41?view=full", {
        identityId: secondIdentity.id,
        activationId: "activation-b",
        status: 403,
        statusText: "Forbidden",
        responseBody: "{\"error\":true}"
      })
    ];
    const user = userEvent.setup();
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[firstIdentity, secondIdentity]} captures={captures} {...callbacks} />);

    await user.selectOptions(screen.getByLabelText("First recorded request"), "capture-left");
    await user.selectOptions(screen.getByLabelText("Matching recorded request"), "capture-right");

    const state = screen.getByTestId("identityComparisonState");
    expect(within(state).getByText("RECORDED FIELDS DIFFER")).toBeInTheDocument();
    expect(within(state).getByText("NOT AN AUTHORIZATION CONCLUSION")).toBeInTheDocument();
    expect(callbacks.onActivate).not.toHaveBeenCalled();
  });

  it("keys causal rows by explicit actionId and retains unmatched background evidence", () => {
    const callbacks = handlers();
    const profile = identity("user-a", { label: "Tenant A user" });
    const captures = [
      capture("caused-request", "https://target.test/api/invoices/41", {
        actionId: "action-submit-invoice",
        identityId: profile.id,
        activationId: "activation-a"
      }),
      capture("background-poll", "https://target.test/api/notifications/poll", {
        startedAt: "2026-07-10T12:00:02.000Z",
        status: 204,
        responseBody: ""
      })
    ];
    render(<IdentityLab workspaceId={WORKSPACE_ID} identities={[profile]} captures={captures} {...callbacks} />);

    expect(screen.getByTestId("causalAction-action-submit-invoice")).toHaveTextContent("ACTION action-submit-invoice");
    const unmatched = screen.getByTestId("causalUnmatched");
    expect(within(unmatched).getByTestId("causalUnmatchedCapture-background-poll")).toHaveTextContent("/api/notifications/poll");
    expect(unmatched).toHaveTextContent("no explicit actionId");
    expect(unmatched).toHaveTextContent("1 RETAINED");
  });
});
