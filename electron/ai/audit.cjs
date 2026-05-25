const auditLog = [];

function pushAudit(entry) {
  auditLog.unshift(entry);
  auditLog.splice(100);
  return entry;
}

function snapshotAudit() {
  return auditLog.slice();
}

function clearAudit() {
  auditLog.length = 0;
}

module.exports = { pushAudit, snapshotAudit, clearAudit };
