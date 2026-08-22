import type { AgentRunProfileId, AgentRunStatus } from "../../shared/agent-types.js";
import type { CapturedRequest, WebSocketDirection } from "../../shared/domain.js";

export type ProfileRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRow = {
  id: string;
  profile_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  workspace_id: string;
  name: string;
  started_at: string;
  updated_at: string;
};

export type SessionSummaryRow = SessionRow & {
  capture_count: number;
  ssl_event_count: number;
};

export type CaptureRow = {
  id: string;
  started_at: string;
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers_json: string;
  request_body: string;
  status: number | null;
  status_text: string;
  mime_type: string;
  resource_type: string;
  response_headers_json: string;
  response_body: string;
  duration_ms: number | null;
  encoded_data_length: number | null;
  allowed: number;
  source: CapturedRequest["source"];
  agent_run_id: string | null;
  navigation_id: string | null;
  action_id: string | null;
  identity_id: string | null;
  activation_id: string | null;
  sequence_run_id: string | null;
  experiment_id: string | null;
  frame_url: string | null;
  initiator: string | null;
  tls_json: string | null;
  intercept_json: string | null;
  rewrite_json: string | null;
};

export type SslEventRow = {
  id: string;
  url: string;
  error: string;
  trusted: number;
  subject_name: string | null;
  issuer_name: string | null;
  created_at: string;
};

export type WebSocketEventRow = {
  id: string;
  request_id: string;
  created_at: string;
  url: string;
  host: string;
  direction: WebSocketDirection;
  opcode: number | null;
  payload_data: string;
  size: number;
  status: number | null;
  status_text: string | null;
  error: string | null;
  request_headers_json: string;
  response_headers_json: string;
  initiator: string | null;
  agent_run_id: string | null;
  navigation_id: string | null;
  action_id: string | null;
  identity_id: string | null;
  activation_id: string | null;
  sequence_run_id: string | null;
  experiment_id: string | null;
  allowed: number;
};

export type AgentRunRow = {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  goal: string;
  profile_id: AgentRunProfileId | null;
  status: AgentRunStatus;
  policy_json: string;
  timeline_json: string;
  findings_json: string;
  checkpoint_json: string;
  mission_json: string;
  capabilities_json: string;
  assessment_json: string;
  error: string | null;
};

export type AgentRunMemoryRow = {
  id: string;
  updated_at: string;
  memory_json: string;
};

export type InterceptRuleRow = {
  rule_json: string;
};

export type MatchReplaceRuleRow = {
  rule_json: string;
};

export type ProxyProfileRow = {
  profile_id: string;
  notes: string;
  updated_at: string;
};

export type ProjectNoteRow = {
  id: string;
  updated_at: string;
  note_json: string;
};

export type SavedViewRow = {
  id: string;
  updated_at: string;
  view_json: string;
};

export type FindingRow = {
  id: string;
  updated_at: string;
  finding_json: string;
};

export type WorkflowDefinitionRow = {
  workflow_json: string;
};

export type WorkflowRevisionRow = {
  revision_json: string;
};

export type WorkflowRunRow = {
  id: string;
  started_at: string;
  run_json: string;
};

export type PluginRow = {
  plugin_json: string;
};

export type PluginAuditRow = {
  audit_json: string;
};

export type IdentityProfileRow = {
  id: string;
  workspace_id: string;
  updated_at: string;
  archived_at: string | null;
  profile_json: string;
};

export type IdentityActivationRow = {
  id: string;
  session_id: string;
  workspace_id: string;
  identity_id: string;
  started_at: string;
  updated_at: string;
  activation_json: string;
};
