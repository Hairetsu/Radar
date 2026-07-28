import type {
  EvidenceAnnotation,
  Finding,
  FindingReport,
  FindingReportOptions,
  InstalledPlugin,
  PluginApiRequest,
  PluginApiResult,
  PluginAuditEntry,
  PluginDeveloperValidation,
  PluginInstallPreview,
  PluginInstallStatus,
  PluginPanelRender,
  PluginPermission,
  WorkflowDefinition,
  WorkflowDryRun,
  WorkflowRevision,
  WorkflowRun
} from "../domain.js";

export type EvidenceExtensionsApi = {
  getEvidenceAnnotations: () => Promise<EvidenceAnnotation[]>;
  saveEvidenceAnnotation: (
    annotation: EvidenceAnnotation
  ) => Promise<EvidenceAnnotation>;
  saveEvidenceAnnotations: (
    annotations: EvidenceAnnotation[]
  ) => Promise<EvidenceAnnotation[]>;
  getFindings: () => Promise<Finding[]>;
  saveFinding: (finding: Finding) => Promise<Finding>;
  deleteFinding: (id: string) => Promise<{ ok: boolean }>;
  buildFindingReport: (
    options: Partial<FindingReportOptions>
  ) => Promise<FindingReport>;
  promoteAutomateResultToFinding: (payload: {
    sessionId: string;
    resultId: string;
  }) => Promise<Finding>;
  getWorkflows: () => Promise<WorkflowDefinition[]>;
  saveWorkflow: (
    workflow: WorkflowDefinition
  ) => Promise<WorkflowDefinition>;
  deleteWorkflow: (
    id: string
  ) => Promise<{ ok: boolean; workflows: WorkflowDefinition[] }>;
  validateWorkflow: (payload: {
    definition: string | WorkflowDefinition;
    inputs?: Record<string, string>;
  }) => Promise<WorkflowDryRun>;
  getWorkflowRevisions: (
    id: string
  ) => Promise<WorkflowRevision[]>;
  getWorkflowRuns: () => Promise<WorkflowRun[]>;
  runWorkflow: (payload: {
    workflowId: string;
    inputs?: Record<string, string>;
    source?: "manual" | "ai";
  }) => Promise<WorkflowRun>;
  promoteWorkflowResultToFinding: (payload: {
    runId: string;
    resultId: string;
  }) => Promise<Finding>;
  getPlugins: () => Promise<InstalledPlugin[]>;
  previewPluginInstall: (
    sourcePath: string
  ) => Promise<PluginInstallPreview>;
  installPlugin: (sourcePath: string) => Promise<InstalledPlugin>;
  approvePlugin: (payload: {
    id: string;
    permissions: PluginPermission[];
  }) => Promise<InstalledPlugin>;
  setPluginStatus: (payload: {
    id: string;
    status: PluginInstallStatus;
  }) => Promise<InstalledPlugin>;
  removePlugin: (
    id: string
  ) => Promise<{ ok: boolean; plugins: InstalledPlugin[] }>;
  getPluginAudit: () => Promise<PluginAuditEntry[]>;
  renderPluginPanel: (payload: {
    pluginId: string;
    panelId: string;
  }) => Promise<PluginPanelRender>;
  validatePlugin: (
    sourcePath: string
  ) => Promise<PluginDeveloperValidation>;
  runPluginApiAction: (
    request: PluginApiRequest
  ) => Promise<PluginApiResult>;
};
