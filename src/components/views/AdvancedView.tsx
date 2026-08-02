import type { Dispatch, SetStateAction } from "react";
import {
  Braces,
  FileCode2,
  FileJson2,
  FolderOpen,
  GitCompare,
  Repeat2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone
} from "lucide-react";
import type { AdvancedTestingSummary } from "../../../shared/advancedTesting.js";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import { advancedSignalTone } from "../../lib";
import type {
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft,
  LocalContext,
  ReplayCollection,
  WorkflowDefinition
} from "../../types";
import { IdentityLab } from "../IdentityLab";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export type AdvancedViewProps = Pick<TrafficDomain, "scopedTrafficCaptures"> & {
  localContext: LocalContext | null;
  identityProfiles: IdentityProfile[];
  activeIdentityActivation: IdentityActivationRecord | undefined;
  identityBusy: boolean;
  createIdentityLabProfile: (draft: IdentityProfileDraft) => Promise<void>;
  updateIdentityLabProfile: (profile: IdentityProfile) => Promise<void>;
  activateIdentityLabProfile: (identityId: string) => Promise<void>;
  verifyIdentityLabProfile: (identityId: string) => Promise<void>;
  archiveIdentityLabProfile: (identityId: string) => Promise<void>;
  advancedImportText: string;
  setAdvancedImportText: Dispatch<SetStateAction<string>>;
  saveAdvancedImportAsCollection: () => Promise<ReplayCollection | null>;
  loadAdvancedImportDraftToRepeater: (draftId?: string) => void;
  prepareAdvancedWorkflowDraft: (
    kind: "api-import" | "graphql" | "auth-row" | "parameter" | "header-signal" | "secret",
    id?: string
  ) => WorkflowDefinition | null;
  advancedSummary: AdvancedTestingSummary;
  identityLabOpen: boolean;
};

export function AdvancedView({
  identityLabOpen,
  localContext,
  identityProfiles,
  scopedTrafficCaptures,
  activeIdentityActivation,
  identityBusy,
  createIdentityLabProfile,
  updateIdentityLabProfile,
  activateIdentityLabProfile,
  verifyIdentityLabProfile,
  archiveIdentityLabProfile,
  advancedSummary,
  advancedImportText,
  setAdvancedImportText,
  saveAdvancedImportAsCollection,
  loadAdvancedImportDraftToRepeater,
  prepareAdvancedWorkflowDraft
}: AdvancedViewProps) {
  return identityLabOpen ? (
    <div className="min-h-0 overflow-auto p-4">
      <IdentityLab
        workspaceId={localContext?.workspace.id || ""}
        identities={identityProfiles}
        captures={scopedTrafficCaptures}
        activeIdentityId={activeIdentityActivation?.identityId}
        activeActivationId={activeIdentityActivation?.id}
        busy={identityBusy}
        onCreate={createIdentityLabProfile}
        onUpdate={updateIdentityLabProfile}
        onActivate={activateIdentityLabProfile}
        onVerify={verifyIdentityLabProfile}
        onArchive={archiveIdentityLabProfile}
      />
    </div>
  ) : (
    <div className="grid min-h-0 [grid-template-columns:minmax(340px,0.46fr)_minmax(520px,1fr)] max-[1180px]:grid-cols-1 max-[1180px]:auto-rows-[minmax(520px,auto)]">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(3,minmax(0,1fr))]">
          {[
            ["GraphQL", advancedSummary.graphql.operationCount],
            ["Params", advancedSummary.parameters.length],
            ["Signals", advancedSummary.headerSignals.length + advancedSummary.secrets.length]
          ].map(([label, value]) => (
            <div key={label} className="radar-card-gradient px-4 py-3">
              <span className="block rd-eyebrow text-muted">
                {label}
              </span>
              <strong className="mt-1 block font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="min-h-0 overflow-auto p-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel htmlFor="advancedImportText" className="px-0 pt-0">
                OpenAPI / Postman JSON preview
              </FieldLabel>
              <Textarea
                id="advancedImportText"
                value={advancedImportText}
                onChange={(event) => setAdvancedImportText(event.target.value)}
                placeholder='{"openapi":"3.0.0","paths":{...}}'
                className="min-h-[190px]"
                data-testid="advancedImportText"
              />
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={advancedSummary.apiImport.ok ? "good" : "danger"}>
                  {advancedSummary.apiImport.sourceType}
                </StatusBadge>
                <StatusBadge tone="move">
                  {advancedSummary.apiImport.drafts.length} templates
                </StatusBadge>
                <StatusBadge>{advancedSummary.apiImport.sitemapSeeds.length} seeds</StatusBadge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void saveAdvancedImportAsCollection()}
                  disabled={advancedSummary.apiImport.drafts.length === 0}
                  data-testid="saveAdvancedImportCollection"
                >
                  <FolderOpen size={13} strokeWidth={1.7} />
                  Save
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => loadAdvancedImportDraftToRepeater()}
                  disabled={advancedSummary.apiImport.drafts.length === 0}
                  data-testid="loadAdvancedImportDraft"
                >
                  <Repeat2 size={13} strokeWidth={1.7} />
                  Load
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => prepareAdvancedWorkflowDraft("api-import")}
                  disabled={advancedSummary.apiImport.drafts.length === 0}
                  data-testid="draftAdvancedImportWorkflow"
                >
                  <GitCompare size={13} strokeWidth={1.7} />
                  Draft
                </Button>
              </div>
              {advancedSummary.apiImport.error && (
                <p className="font-mono text-meta uppercase tracking-key text-rust">
                  {advancedSummary.apiImport.error}
                </p>
              )}
            </div>

            <div className="grid gap-2" data-testid="advancedImportPreview">
              {advancedSummary.apiImport.drafts.length === 0 && (
                <EmptyState className="min-h-[150px] border border-dashed border-rule">
                  <FileJson2 size={18} strokeWidth={1.4} />
                  <span>Paste OpenAPI or Postman JSON to preview replay templates.</span>
                </EmptyState>
              )}
              {advancedSummary.apiImport.drafts.slice(0, 8).map((draft) => (
                <div key={draft.id} className="grid gap-2 border border-rule bg-ink/25 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusBadge tone="move">{draft.method}</StatusBadge>
                    <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                      {draft.path}
                    </strong>
                  </div>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
                    {draft.url}
                  </span>
                  {draft.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draft.tags.slice(0, 4).map((tag) => (
                        <StatusBadge key={tag}>{tag}</StatusBadge>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => loadAdvancedImportDraftToRepeater(draft.id)}
                      data-testid={`loadAdvancedImportDraft-${draft.id}`}
                    >
                      <Repeat2 size={13} strokeWidth={1.7} />
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => prepareAdvancedWorkflowDraft("api-import")}
                      data-testid={`draftAdvancedImportWorkflow-${draft.id}`}
                    >
                      <GitCompare size={13} strokeWidth={1.7} />
                      Workflow
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-2 gap-px overflow-auto bg-rule max-[900px]:grid-cols-1" data-testid="advancedWorkbench">
        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Braces size={15} strokeWidth={1.7} className="text-signal" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                GraphQL Review
              </h3>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <StatusBadge tone="move">{advancedSummary.graphql.hosts.length} hosts</StatusBadge>
              <StatusBadge>{advancedSummary.graphql.groups.length} groups</StatusBadge>
              <StatusBadge>{advancedSummary.graphql.variableTemplates.length} vars</StatusBadge>
            </div>
          </div>
          <div className="grid gap-2">
            {advancedSummary.graphql.operations.length === 0 && <EmptyState>No GraphQL operations observed</EmptyState>}
            {advancedSummary.graphql.operations.slice(0, 8).map((operation) => (
              <div key={operation.id} className="grid gap-2 border border-rule bg-surface/35 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge tone={operation.introspection ? "warn" : "ghost"}>{operation.operationType}</StatusBadge>
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                    {operation.operationName}
                  </strong>
                </div>
                <span className="font-mono text-label text-muted">
                  {operation.transport} / {operation.path} / vars {operation.variables.length}
                  {operation.batched ? " / batched" : ""}
                  {operation.introspection ? " / introspection" : ""}
                </span>
                <Button
                  variant="outline"
                  size="compact"
                  type="button"
                  onClick={() => prepareAdvancedWorkflowDraft("graphql", operation.id)}
                  data-testid={`draftGraphqlWorkflow-${operation.id}`}
                >
                  <GitCompare size={13} strokeWidth={1.7} />
                  Draft
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} strokeWidth={1.7} className="text-signal" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                Auth Matrix
              </h3>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <StatusBadge>{advancedSummary.authMatrix.length} rows</StatusBadge>
              <StatusBadge tone="move">{advancedSummary.authComparisons.length} comparisons</StatusBadge>
            </div>
          </div>
          <div className="grid gap-2">
            {advancedSummary.authMatrix.length === 0 && <EmptyState>No auth-state comparisons observed</EmptyState>}
            {advancedSummary.authMatrix.slice(0, 8).map((row) => (
              <div key={row.id} className="grid gap-2 border border-rule bg-surface/35 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge tone={row.verdict === "protected" ? "good" : row.verdict === "public" ? "warn" : "ghost"}>
                    {row.verdict}
                  </StatusBadge>
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                    {row.method} {row.path}
                  </strong>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(row.statuses).map(([state, status]) => (
                    <StatusBadge key={state}>
                      {state}:{status}
                    </StatusBadge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="compact"
                  type="button"
                  onClick={() => prepareAdvancedWorkflowDraft("auth-row", row.id)}
                  data-testid={`draftAuthWorkflow-${row.id}`}
                >
                  <GitCompare size={13} strokeWidth={1.7} />
                  Draft
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Search size={15} strokeWidth={1.7} className="text-signal" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                Parameters
              </h3>
            </div>
            <StatusBadge tone="move">{advancedSummary.parameters.length} found</StatusBadge>
          </div>
          <div className="grid gap-2">
            {advancedSummary.parameters.length === 0 && <EmptyState>No parameters discovered</EmptyState>}
            {advancedSummary.parameters.slice(0, 12).map((parameter) => (
              <div key={parameter.id} className="flex items-center justify-between gap-3 border border-rule bg-surface/35 px-3 py-2">
                <div className="min-w-0">
                  <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                    {parameter.name}
                  </strong>
                  <span className="rd-label text-muted">
                    {parameter.location} / {parameter.endpoints.length} endpoints
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge>{parameter.count}</StatusBadge>
                  <Button
                    variant="outline"
                    size="compact"
                    type="button"
                    onClick={() => prepareAdvancedWorkflowDraft("parameter", parameter.id)}
                    data-testid={`draftParameterWorkflow-${parameter.id}`}
                  >
                    <GitCompare size={13} strokeWidth={1.7} />
                    Draft
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} strokeWidth={1.7} className="text-rust" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                Local Secret Signals
              </h3>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <StatusBadge>{advancedSummary.secretRules.length} rules</StatusBadge>
              <StatusBadge tone={advancedSummary.secrets.length > 0 ? "danger" : "good"}>
                {advancedSummary.secrets.length}
              </StatusBadge>
            </div>
          </div>
          <div className="grid gap-2">
            {advancedSummary.secrets.length === 0 && <EmptyState>No secret-shaped response data detected</EmptyState>}
            {advancedSummary.secrets.slice(0, 8).map((secret) => (
              <div key={secret.id} className="grid gap-2 border border-rust/35 bg-rust/5 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge tone={advancedSignalTone(secret.severity)}>{secret.severity}</StatusBadge>
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                    {secret.pattern}
                  </strong>
                </div>
                <span className="font-mono text-label text-muted">
                  {secret.location} / {secret.preview}
                </span>
                <Button
                  variant="outline"
                  size="compact"
                  type="button"
                  onClick={() => prepareAdvancedWorkflowDraft("secret", secret.id)}
                  data-testid={`draftSecretWorkflow-${secret.id}`}
                >
                  <GitCompare size={13} strokeWidth={1.7} />
                  Draft
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode2 size={15} strokeWidth={1.7} className="text-signal" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                Header Behavior
              </h3>
            </div>
            <StatusBadge>{advancedSummary.headerSignals.length} signals</StatusBadge>
          </div>
          <div className="grid gap-2">
            {advancedSummary.headerSignals.length === 0 && <EmptyState>No cache or header behavior signals</EmptyState>}
            {advancedSummary.headerSignals.slice(0, 8).map((signal) => (
              <div key={signal.id} className="grid gap-2 border border-rule bg-surface/35 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge tone={advancedSignalTone(signal.severity)}>{signal.kind}</StatusBadge>
                  <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-bone">
                    {signal.title}
                  </strong>
                </div>
                <p className="text-body leading-5 text-copy">{signal.message}</p>
                <Button
                  variant="outline"
                  size="compact"
                  type="button"
                  onClick={() => prepareAdvancedWorkflowDraft("header-signal", signal.id)}
                  data-testid={`draftHeaderWorkflow-${signal.id}`}
                >
                  <GitCompare size={13} strokeWidth={1.7} />
                  Draft
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-[280px] overflow-auto bg-ink p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Smartphone size={15} strokeWidth={1.7} className="text-signal" />
              <h3 className="font-display text-title uppercase tracking-data text-bone [font-stretch:75%]">
                Proxy Guidance
              </h3>
            </div>
            <StatusBadge tone="move">{advancedSummary.proxyGuidance.length} profiles</StatusBadge>
          </div>
          <div className="grid gap-2">
            {advancedSummary.proxyGuidance.map((profile) => (
              <div key={profile.id} className="grid gap-2 border border-rule bg-surface/35 p-3">
                <strong className="font-display text-lead uppercase tracking-data text-bone">
                  {profile.title}
                </strong>
                <p className="text-body leading-5 text-copy">{profile.summary}</p>
                <ul className="grid gap-1 font-mono text-label text-muted">
                  {profile.checklist.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
