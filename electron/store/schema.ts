import type { DatabaseSync } from "node:sqlite";

export function applyCurrentSchema(db: DatabaseSync) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_targets (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      target TEXT NOT NULL,
      PRIMARY KEY (workspace_id, target)
    );

    CREATE TABLE IF NOT EXISTS captures (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT NOT NULL,
      path TEXT NOT NULL,
      request_headers_json TEXT NOT NULL,
      request_body TEXT NOT NULL,
      status INTEGER,
      status_text TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      response_headers_json TEXT NOT NULL,
      response_body TEXT NOT NULL,
      duration_ms INTEGER,
      encoded_data_length INTEGER,
      allowed INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('browser', 'repeater', 'proxy')),
      agent_run_id TEXT,
      navigation_id TEXT,
      action_id TEXT,
      identity_id TEXT,
      activation_id TEXT,
      sequence_run_id TEXT,
      experiment_id TEXT,
      frame_url TEXT,
      initiator TEXT,
      tls_json TEXT,
      intercept_json TEXT,
      rewrite_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS ssl_events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      url TEXT NOT NULL,
      error TEXT NOT NULL,
      trusted INTEGER NOT NULL,
      subject_name TEXT,
      issuer_name TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS websocket_events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('handshake', 'sent', 'received', 'error', 'closed')),
      opcode INTEGER,
      payload_data TEXT NOT NULL,
      size INTEGER NOT NULL,
      status INTEGER,
      status_text TEXT,
      error TEXT,
      request_headers_json TEXT NOT NULL,
      response_headers_json TEXT NOT NULL,
      initiator TEXT,
      agent_run_id TEXT,
      navigation_id TEXT,
      action_id TEXT,
      identity_id TEXT,
      activation_id TEXT,
      sequence_run_id TEXT,
      experiment_id TEXT,
      allowed INTEGER NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, model_id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      goal TEXT NOT NULL,
      profile_id TEXT NOT NULL DEFAULT 'passive-map',
      status TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      timeline_json TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      checkpoint_json TEXT NOT NULL DEFAULT '{}',
      mission_json TEXT NOT NULL DEFAULT '{}',
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      assessment_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_intercept_rules (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      rule_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_match_replace_rules (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      rule_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_proxy_profiles (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL,
      notes TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_saved_filters (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      filter_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_project_notes (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      note_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_saved_views (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      view_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_agent_memory (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      memory_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_identity_profiles (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      profile_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS session_evidence_annotations (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('capture', 'websocket')),
      tags_json TEXT NOT NULL,
      comment TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (session_id, evidence_id, kind)
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_tabs (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_environments (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      environment_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_collections (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      collection_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_automate_payload_sets (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      payload_set_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_workflows (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      workflow_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_workflow_revisions (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      workflow_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      revision_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, workflow_id, revision_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_plugins (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      plugin_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, plugin_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_plugin_audit (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      audit_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS session_automate_sessions (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      session_json TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS session_findings (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finding_json TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS session_workflow_runs (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      run_json TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS session_identity_activations (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      identity_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activation_json TEXT NOT NULL,
      PRIMARY KEY (session_id, id),
      FOREIGN KEY (workspace_id, identity_id)
        REFERENCES workspace_identity_profiles(workspace_id, id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_captures_session_started
      ON captures(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_host
      ON captures(session_id, host, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ssl_events_session_created
      ON ssl_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_websocket_events_session_created
      ON websocket_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_websocket_events_session_request
      ON websocket_events(session_id, request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session_updated
      ON agent_runs(session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_automate_sessions_updated
      ON session_automate_sessions(session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_findings_session_updated
      ON session_findings(session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_session_started
      ON session_workflow_runs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_workflow_revisions_saved
      ON workspace_workflow_revisions(workspace_id, workflow_id, saved_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_plugins_updated
      ON workspace_plugins(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_plugin_audit_created
      ON workspace_plugin_audit(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_notes_updated
      ON workspace_project_notes(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_saved_views_updated
      ON workspace_saved_views(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_agent_memory_updated
      ON workspace_agent_memory(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_identity_profiles_updated
      ON workspace_identity_profiles(workspace_id, archived_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_identity_activations_started
      ON session_identity_activations(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_identity_activations_identity
      ON session_identity_activations(session_id, identity_id, started_at DESC);
  `);

    const captureColumns = new Set(
      (
        db.prepare("PRAGMA table_info(captures)").all() as Array<{
          name: string;
        }>
      ).map((column) => column.name)
    );
    const captureColumnMigrations: Array<[string, string]> = [
      ["agent_run_id", "TEXT"],
      ["navigation_id", "TEXT"],
      ["action_id", "TEXT"],
      ["identity_id", "TEXT"],
      ["activation_id", "TEXT"],
      ["sequence_run_id", "TEXT"],
      ["experiment_id", "TEXT"],
      ["frame_url", "TEXT"],
      ["initiator", "TEXT"],
      ["intercept_json", "TEXT"],
      ["rewrite_json", "TEXT"]
    ];
    for (const [name, type] of captureColumnMigrations) {
      if (!captureColumns.has(name)) {
        db.exec(`ALTER TABLE captures ADD COLUMN ${name} ${type}`);
      }
    }
    const webSocketColumns = new Set(
      (
        db.prepare("PRAGMA table_info(websocket_events)").all() as Array<{
          name: string;
        }>
      ).map((column) => column.name)
    );
    const webSocketColumnMigrations: Array<[string, string]> = [
      ["agent_run_id", "TEXT"],
      ["navigation_id", "TEXT"],
      ["action_id", "TEXT"],
      ["identity_id", "TEXT"],
      ["activation_id", "TEXT"],
      ["sequence_run_id", "TEXT"],
      ["experiment_id", "TEXT"]
    ];
    for (const [name, type] of webSocketColumnMigrations) {
      if (!webSocketColumns.has(name)) {
        db.exec(`ALTER TABLE websocket_events ADD COLUMN ${name} ${type}`);
      }
    }
    const agentRunColumns = new Set(
      (
        db.prepare("PRAGMA table_info(agent_runs)").all() as Array<{
          name: string;
        }>
      ).map((column) => column.name)
    );
    if (!agentRunColumns.has("profile_id")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'passive-map'");
    }
    if (!agentRunColumns.has("checkpoint_json")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN checkpoint_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!agentRunColumns.has("mission_json")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN mission_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!agentRunColumns.has("capabilities_json")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!agentRunColumns.has("assessment_json")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN assessment_json TEXT NOT NULL DEFAULT '{}'");
    }
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_captures_session_agent_run
      ON captures(session_id, agent_run_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_action
      ON captures(session_id, action_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_identity
      ON captures(session_id, identity_id, started_at DESC);
  `);
}
