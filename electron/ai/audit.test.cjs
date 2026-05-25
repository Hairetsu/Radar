import { afterEach, describe, expect, it } from "vitest";
const { pushAudit, snapshotAudit, clearAudit } = require("./audit.cjs");

describe("audit", () => {
  afterEach(() => {
    clearAudit();
  });

  it("prepends entries and caps log size", () => {
    for (let i = 0; i < 105; i += 1) {
      pushAudit({ id: `entry-${i}` });
    }
    expect(snapshotAudit()).toHaveLength(100);
    expect(snapshotAudit()[0].id).toBe("entry-104");
  });

  it("returns a copy from snapshot", () => {
    pushAudit({ id: "one" });
    const snap = snapshotAudit();
    snap.push({ id: "two" });
    expect(snapshotAudit()).toHaveLength(1);
  });

  it("clears audit log", () => {
    pushAudit({ id: "one" });
    clearAudit();
    expect(snapshotAudit()).toEqual([]);
  });
});
