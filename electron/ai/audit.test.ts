import type { AiAuditEntry } from "../../shared/ai-types.js";
import { afterEach, describe, expect, it } from "vitest";
import { pushAudit, snapshotAudit, clearAudit } from "./audit.js";

describe("audit", () => {
  afterEach(() => {
    clearAudit();
  });

  it("prepends entries and caps log size", () => {
    for (let i = 0; i < 105; i += 1) {
      pushAudit({ id: `entry-${i}` } as AiAuditEntry);
    }
    expect(snapshotAudit()).toHaveLength(100);
    expect(snapshotAudit()[0].id).toBe("entry-104");
  });

  it("returns a copy from snapshot", () => {
    pushAudit({ id: "one" } as AiAuditEntry);
    const snap = snapshotAudit();
    snap.push({ id: "two" } as AiAuditEntry);
    expect(snapshotAudit()).toHaveLength(1);
  });

  it("clears audit log", () => {
    pushAudit({ id: "one" } as AiAuditEntry);
    clearAudit();
    expect(snapshotAudit()).toEqual([]);
  });
});
