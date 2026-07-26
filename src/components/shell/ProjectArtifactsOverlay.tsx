import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  bundleRedactionOptions,
  bundleStatsLine,
  cn,
  handoffStatsLine
} from "../../lib";
import type { WorkView } from "../../hooks/workbench/viewMeta";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import type {
  HandoffPackagePreview,
  ProjectBundleApplyResult,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectBundleRedactionProfile,
  ProjectNote,
  SavedView
} from "../../types";

type ArtifactWriteResult<TPreview> = {
  ok: boolean;
  path?: string;
  preview: TPreview;
  error?: string;
};

export type ProjectArtifactsOverlayWorkbench = {
  setProjectArtifactsOpen: Dispatch<SetStateAction<boolean>>;
  projectNotes: ProjectNote[];
  startProjectNote: () => void;
  selectedProjectNoteId: string;
  selectProjectNote: (noteId: string) => void;
  projectNoteTitle: string;
  setProjectNoteTitle: Dispatch<SetStateAction<string>>;
  projectNoteBody: string;
  setProjectNoteBody: Dispatch<SetStateAction<string>>;
  selectedProjectNote: ProjectNote | null;
  deleteProjectNote: (noteId?: string) => Promise<void>;
  savedViews: SavedView[];
  activeView: WorkView;
  savedViewName: string;
  setSavedViewName: Dispatch<SetStateAction<string>>;
  savedViewDescription: string;
  setSavedViewDescription: Dispatch<SetStateAction<string>>;
  applySavedView: (view: SavedView) => void;
  deleteSavedView: (viewId: string) => Promise<void>;
  bundleActionPending: boolean;
  bundleRedaction: ProjectBundleRedactionProfile;
  setBundleRedaction: Dispatch<SetStateAction<ProjectBundleRedactionProfile>>;
  bundleIncludeReplayCollections: boolean;
  setBundleIncludeReplayCollections: Dispatch<SetStateAction<boolean>>;
  bundleIncludePlugins: boolean;
  setBundleIncludePlugins: Dispatch<SetStateAction<boolean>>;
  previewProjectBundleExport: () => Promise<ProjectBundleExportPreview | null>;
  writeProjectBundle: () => Promise<ArtifactWriteResult<ProjectBundleExportPreview> | null>;
  bundleExportPreview: ProjectBundleExportPreview | null;
  bundleImportPath: string;
  setBundleImportPath: Dispatch<SetStateAction<string>>;
  previewProjectBundleImport: () => Promise<ProjectBundleImportPreview | null>;
  applyProjectBundleImport: () => Promise<ProjectBundleApplyResult | null>;
  bundleImportPreview: ProjectBundleImportPreview | null;
  handoffTitle: string;
  setHandoffTitle: Dispatch<SetStateAction<string>>;
  handoffIncludeDraftFindings: boolean;
  setHandoffIncludeDraftFindings: Dispatch<SetStateAction<boolean>>;
  handoffIncludeProjectNotes: boolean;
  setHandoffIncludeProjectNotes: Dispatch<SetStateAction<boolean>>;
  handoffIncludeWorkflows: boolean;
  setHandoffIncludeWorkflows: Dispatch<SetStateAction<boolean>>;
  previewHandoffPackage: () => Promise<HandoffPackagePreview | null>;
  writeHandoffPackage: () => Promise<ArtifactWriteResult<HandoffPackagePreview> | null>;
  handoffPreview: HandoffPackagePreview | null;
};

export type ProjectArtifactsOverlayProps = {
  workbench: ProjectArtifactsOverlayWorkbench;
  submitProjectNote: (event: FormEvent) => void;
  submitSavedView: (event: FormEvent) => void;
};

export function ProjectArtifactsOverlay({
  workbench,
  submitProjectNote,
  submitSavedView
}: ProjectArtifactsOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-start bg-ink/76 px-4 py-[8vh] backdrop-blur-sm"
      data-testid="projectArtifactsOverlay"
      data-component="projectArtifactsOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          workbench.setProjectArtifactsOpen(false);
        }
      }}
    >
      <section className="mx-auto grid w-full max-w-5xl border border-steel/45 bg-surface shadow-[0_36px_128px_-78px_var(--color-steel)] [grid-template-rows:auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule radar-form-gradient p-3">
          <div>
            <span className="block rd-eyebrow text-steel">
              Project artifacts
            </span>
            <h3 className="font-display text-head font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
              Notes And Saved Views
            </h3>
          </div>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={() => workbench.setProjectArtifactsOpen(false)}
            aria-label="Close project artifacts"
            data-testid="closeProjectArtifacts"
            data-component="closeProjectArtifacts"
          >
            <X size={15} strokeWidth={1.8} />
          </Button>
        </div>
        <div className="grid max-h-[72vh] min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] overflow-hidden max-[900px]:grid-cols-1 max-[900px]:overflow-auto">
          <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)] max-[900px]:border-b max-[900px]:border-r-0">
            <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
              <span className="rd-eyebrow text-muted">
                {workbench.projectNotes.length} project note{workbench.projectNotes.length === 1 ? "" : "s"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="compact"
                onClick={workbench.startProjectNote}
                data-testid="newProjectNote"
                data-component="newProjectNote"
              >
                <Plus size={13} strokeWidth={1.7} />
                New
              </Button>
            </div>
            <div className="grid min-h-0 grid-cols-[210px_minmax(0,1fr)] max-[760px]:grid-cols-1">
              <div className="min-h-0 overflow-auto border-r border-rule max-[760px]:max-h-44 max-[760px]:border-b max-[760px]:border-r-0">
                {workbench.projectNotes.length === 0 && (
                  <div className="p-3">
                    <EmptyState>No notes saved for this project.</EmptyState>
                  </div>
                )}
                {workbench.projectNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={cn(
                      "block w-full border-b border-rule px-3 py-3 text-left transition hover:bg-steel/5 hover:text-bone",
                      workbench.selectedProjectNoteId === note.id && "bg-steel/[0.08] text-bone"
                    )}
                    onClick={() => workbench.selectProjectNote(note.id)}
                    data-testid={`projectNote-${note.id}`}
                    data-component="projectNote"
                  >
                    <strong className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data [font-stretch:75%]">
                      {note.title}
                    </strong>
                    <span className="mt-1 block line-clamp-2 text-meta leading-relaxed text-muted">
                      {note.body || "No body"}
                    </span>
                  </button>
                ))}
              </div>
              <form className="grid min-h-0 gap-3 p-3 [grid-template-rows:auto_minmax(160px,1fr)_auto]" onSubmit={submitProjectNote}>
                <Input
                  value={workbench.projectNoteTitle}
                  onChange={(event) => workbench.setProjectNoteTitle(event.target.value)}
                  placeholder="Note title"
                  data-testid="projectNoteTitle"
                  data-component="projectNoteTitle"
                />
                <Textarea
                  value={workbench.projectNoteBody}
                  onChange={(event) => workbench.setProjectNoteBody(event.target.value)}
                  placeholder="Scope decisions, auth context, test credentials, hypotheses, or handoff notes..."
                  className="min-h-[220px] resize-none"
                  data-testid="projectNoteBody"
                  data-component="projectNoteBody"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rd-label text-muted">
                    {workbench.selectedProjectNote ? "Editing saved note" : "Drafting new note"}
                  </span>
                  <div className="flex items-center gap-2">
                    {workbench.selectedProjectNote && (
                      <Button
                        type="button"
                        variant="outline"
                        size="compact"
                        onClick={() => void workbench.deleteProjectNote()}
                        data-testid="deleteProjectNote"
                        data-component="deleteProjectNote"
                      >
                        <Trash2 size={13} strokeWidth={1.7} />
                        Delete
                      </Button>
                    )}
                    <Button type="submit" variant="solid" size="compact" data-testid="saveProjectNote">
                      Save Note
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)]">
            <form className="grid gap-3 border-b border-rule p-3" onSubmit={submitSavedView}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block rd-eyebrow text-muted">
                    Saved views
                  </span>
                  <p className="text-body leading-relaxed text-copy">
                    Store the active view, filters, selection, and related panel state.
                  </p>
                </div>
                <StatusBadge>{workbench.activeView}</StatusBadge>
              </div>
              <Input
                value={workbench.savedViewName}
                onChange={(event) => workbench.setSavedViewName(event.target.value)}
                placeholder="Saved view name"
                data-testid="savedViewName"
                data-component="savedViewName"
              />
              <Textarea
                value={workbench.savedViewDescription}
                onChange={(event) => workbench.setSavedViewDescription(event.target.value)}
                placeholder="Why this view matters..."
                className="min-h-[72px] resize-none"
                data-testid="savedViewDescription"
                data-component="savedViewDescription"
              />
              <Button type="submit" variant="solid" size="compact" data-testid="saveCurrentView">
                Save Current View
              </Button>
            </form>
            <div className="min-h-0 overflow-auto p-2">
              {workbench.savedViews.length === 0 && <EmptyState>No saved views yet.</EmptyState>}
              {workbench.savedViews.map((view) => (
                <div
                  key={view.id}
                  className="mb-2 border border-rule bg-ink/24 p-3"
                  data-testid={`savedView-${view.id}`}
                  data-component="savedView"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block rd-eyebrow text-steel">
                        {view.view}
                      </span>
                      <strong className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone [font-stretch:75%]">
                        {view.name}
                      </strong>
                    </div>
                    <StatusBadge>{Object.keys(view.state).length} keys</StatusBadge>
                  </div>
                  {view.description && (
                    <p className="mt-2 line-clamp-2 text-body leading-relaxed text-copy">{view.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rd-label text-muted">
                      {view.updatedAt.slice(0, 16).replace("T", " ")}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="compact"
                        onClick={() => workbench.applySavedView(view)}
                        data-testid={`openSavedView-${view.id}`}
                        data-component="openSavedView"
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="compact"
                        onClick={() => void workbench.deleteSavedView(view.id)}
                        data-testid={`deleteSavedView-${view.id}`}
                        data-component="deleteSavedView"
                      >
                        <Trash2 size={13} strokeWidth={1.7} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <div
                className="mt-3 border border-steel/35 bg-steel/[0.04] p-3"
                data-testid="projectBundlePanel"
                data-component="projectBundlePanel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="block rd-eyebrow text-steel">
                      Project bundle
                    </span>
                    <p className="mt-1 text-body leading-relaxed text-copy">
                      Export or import a local JSON bundle. Imported scope targets stay inactive until you add them in Scope.
                    </p>
                  </div>
                  <StatusBadge>{workbench.bundleActionPending ? "working" : "local"}</StatusBadge>
                </div>
                <div className="mt-3 grid gap-2">
                  <FieldLabel>Redaction profile</FieldLabel>
                  <Select
                    value={workbench.bundleRedaction}
                    onChange={(event) =>
                      workbench.setBundleRedaction(event.target.value as ProjectBundleRedactionProfile)
                    }
                    data-testid="bundleRedaction"
                    data-component="bundleRedaction"
                  >
                    {bundleRedactionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 rd-label text-muted">
                    <input
                      type="checkbox"
                      checked={workbench.bundleIncludeReplayCollections}
                      onChange={(event) => workbench.setBundleIncludeReplayCollections(event.target.checked)}
                      data-testid="bundleIncludeReplayCollections"
                    />
                    Include Repeater collections
                  </label>
                  <label className="flex items-center gap-2 rd-label text-muted">
                    <input
                      type="checkbox"
                      checked={workbench.bundleIncludePlugins}
                      onChange={(event) => workbench.setBundleIncludePlugins(event.target.checked)}
                      data-testid="bundleIncludePlugins"
                    />
                    Include plugin metadata
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="compact"
                      onClick={() => void workbench.previewProjectBundleExport()}
                      disabled={workbench.bundleActionPending}
                      data-testid="previewProjectBundleExport"
                      data-component="previewProjectBundleExport"
                    >
                      Preview Export
                    </Button>
                    <Button
                      type="button"
                      variant="solid"
                      size="compact"
                      onClick={() => void workbench.writeProjectBundle()}
                      disabled={workbench.bundleActionPending}
                      data-testid="writeProjectBundle"
                      data-component="writeProjectBundle"
                    >
                      Export Bundle
                    </Button>
                  </div>
                  {workbench.bundleExportPreview && (
                    <div className="border border-rule bg-ink/24 p-2 text-meta leading-relaxed text-copy" data-testid="bundleExportPreview">
                      <p className="rd-label text-muted">
                        {bundleStatsLine(workbench.bundleExportPreview.stats)}
                      </p>
                      {workbench.bundleExportPreview.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-sand">
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-2 border-t border-rule pt-3">
                  <FieldLabel>Import path</FieldLabel>
                  <Input
                    value={workbench.bundleImportPath}
                    onChange={(event) => workbench.setBundleImportPath(event.target.value)}
                    placeholder="/path/to/project.radar-bundle.json, or leave blank for file picker"
                    data-testid="bundleImportPath"
                    data-component="bundleImportPath"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="compact"
                      onClick={() => void workbench.previewProjectBundleImport()}
                      disabled={workbench.bundleActionPending}
                      data-testid="previewProjectBundleImport"
                      data-component="previewProjectBundleImport"
                    >
                      Preview Import
                    </Button>
                    <Button
                      type="button"
                      variant="solid"
                      size="compact"
                      onClick={() => void workbench.applyProjectBundleImport()}
                      disabled={workbench.bundleActionPending || !workbench.bundleImportPreview?.ok}
                      data-testid="applyProjectBundleImport"
                      data-component="applyProjectBundleImport"
                    >
                      Apply Import
                    </Button>
                  </div>
                  {workbench.bundleImportPreview && (
                    <div className="border border-rule bg-ink/24 p-2 text-meta leading-relaxed text-copy" data-testid="bundleImportPreview">
                      <p className="rd-label text-muted">
                        {bundleStatsLine(workbench.bundleImportPreview.stats)}
                      </p>
                      {workbench.bundleImportPreview.inactiveTargets.length > 0 && (
                        <p className="mt-1 text-sand">
                          Inactive proposed scope: {workbench.bundleImportPreview.inactiveTargets.join(", ")}
                        </p>
                      )}
                      {workbench.bundleImportPreview.conflicts.length > 0 && (
                        <p className="mt-1 text-muted">
                          Conflicts: {workbench.bundleImportPreview.conflicts.length} matching ids will be skipped to preserve existing records.
                        </p>
                      )}
                      {workbench.bundleImportPreview.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-sand">
                          {warning}
                        </p>
                      ))}
                      {workbench.bundleImportPreview.error && (
                        <p className="mt-1 text-rust">{workbench.bundleImportPreview.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="mt-3 border border-sand/35 bg-sand/[0.04] p-3"
                data-testid="handoffPackagePanel"
                data-component="handoffPackagePanel"
              >
                <div>
                  <span className="block rd-eyebrow text-sand">
                    Handoff package
                  </span>
                  <p className="mt-1 text-body leading-relaxed text-copy">
                    Export reviewed findings, referenced evidence, scope summary, notes, workflows, and a Markdown handoff summary.
                  </p>
                </div>
                <div className="mt-3 grid gap-2">
                  <FieldLabel>Handoff title</FieldLabel>
                  <Input
                    value={workbench.handoffTitle}
                    onChange={(event) => workbench.setHandoffTitle(event.target.value)}
                    placeholder="Auth review handoff"
                    data-testid="handoffTitle"
                    data-component="handoffTitle"
                  />
                  <label className="flex items-center gap-2 rd-label text-muted">
                    <input
                      type="checkbox"
                      checked={workbench.handoffIncludeDraftFindings}
                      onChange={(event) => workbench.setHandoffIncludeDraftFindings(event.target.checked)}
                      data-testid="handoffIncludeDraftFindings"
                    />
                    Include draft findings
                  </label>
                  <label className="flex items-center gap-2 rd-label text-muted">
                    <input
                      type="checkbox"
                      checked={workbench.handoffIncludeProjectNotes}
                      onChange={(event) => workbench.setHandoffIncludeProjectNotes(event.target.checked)}
                      data-testid="handoffIncludeProjectNotes"
                    />
                    Include project notes
                  </label>
                  <label className="flex items-center gap-2 rd-label text-muted">
                    <input
                      type="checkbox"
                      checked={workbench.handoffIncludeWorkflows}
                      onChange={(event) => workbench.setHandoffIncludeWorkflows(event.target.checked)}
                      data-testid="handoffIncludeWorkflows"
                    />
                    Include workflows
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="compact"
                      onClick={() => void workbench.previewHandoffPackage()}
                      disabled={workbench.bundleActionPending}
                      data-testid="previewHandoffPackage"
                      data-component="previewHandoffPackage"
                    >
                      Preview Handoff
                    </Button>
                    <Button
                      type="button"
                      variant="solid"
                      size="compact"
                      onClick={() => void workbench.writeHandoffPackage()}
                      disabled={workbench.bundleActionPending}
                      data-testid="writeHandoffPackage"
                      data-component="writeHandoffPackage"
                    >
                      Export Handoff
                    </Button>
                  </div>
                  {workbench.handoffPreview && (
                    <div className="border border-rule bg-ink/24 p-2 text-meta leading-relaxed text-copy" data-testid="handoffPreview">
                      <p className="rd-label text-muted">
                        {handoffStatsLine(workbench.handoffPreview.stats)}
                      </p>
                      {workbench.handoffPreview.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-sand">
                          {warning}
                        </p>
                      ))}
                      {workbench.handoffPreview.error && (
                        <p className="mt-1 text-rust">{workbench.handoffPreview.error}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
