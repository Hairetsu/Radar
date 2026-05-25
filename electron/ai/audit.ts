import type { AiAuditEntry } from "../../shared/ai-types.js";

const auditLog: AiAuditEntry[] = [];

export function pushAudit(entry: AiAuditEntry) {
  auditLog.unshift(entry);
  auditLog.splice(100);
  return entry;
}

export function snapshotAudit() {
  return auditLog.slice();
}

export function clearAudit() {
  auditLog.length = 0;
}
