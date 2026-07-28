import type {
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  ProjectNote,
  SavedFilter,
  SavedView
} from "../domain.js";
import type {
  GlobalSearchRequest,
  GlobalSearchResponse
} from "../globalSearch.js";
import type {
  ProjectBundleApplyResult,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectBundleOptions
} from "../projectBundle.js";
import type {
  HandoffPackageOptions,
  HandoffPackagePreview
} from "../handoffPackage.js";

export type LocalProjectApi = {
  getLocalContext: () => Promise<LocalContext>;
  listLocalProfiles: () => Promise<LocalProfile[]>;
  createLocalProfile: (name?: string) => Promise<LocalContext>;
  saveLocalProfile: (payload: {
    id: string;
    name: string;
  }) => Promise<LocalProfile>;
  loadLocalProfile: (id: string) => Promise<LocalContext>;
  listLocalSessions: (
    profileId?: string
  ) => Promise<LocalSessionSummary[]>;
  createLocalSession: (name?: string) => Promise<LocalContext>;
  saveLocalSession: (payload: {
    id: string;
    name: string;
  }) => Promise<LocalSession>;
  loadLocalSession: (id: string) => Promise<LocalContext>;
  seedDemoProject: () => Promise<LocalContext>;
  searchGlobal: (
    request: GlobalSearchRequest
  ) => Promise<GlobalSearchResponse>;
  getSavedFilters: () => Promise<SavedFilter[]>;
  setSavedFilters: (
    filters: SavedFilter[]
  ) => Promise<SavedFilter[]>;
  getProjectNotes: () => Promise<ProjectNote[]>;
  saveProjectNote: (note: ProjectNote) => Promise<ProjectNote>;
  deleteProjectNote: (
    id: string
  ) => Promise<{ ok: boolean; notes: ProjectNote[] }>;
  getSavedViews: () => Promise<SavedView[]>;
  saveSavedView: (view: SavedView) => Promise<SavedView>;
  deleteSavedView: (
    id: string
  ) => Promise<{ ok: boolean; views: SavedView[] }>;
  previewProjectBundleExport: (
    options: ProjectBundleOptions
  ) => Promise<ProjectBundleExportPreview>;
  writeProjectBundle: (
    options: ProjectBundleOptions
  ) => Promise<{
    ok: boolean;
    path?: string;
    preview: ProjectBundleExportPreview;
    error?: string;
  }>;
  previewProjectBundleImport: (payload: {
    sourcePath?: string;
  }) => Promise<ProjectBundleImportPreview>;
  applyProjectBundleImport: (payload: {
    sourcePath?: string;
  }) => Promise<ProjectBundleApplyResult>;
  previewHandoffPackage: (
    options: HandoffPackageOptions
  ) => Promise<HandoffPackagePreview>;
  writeHandoffPackage: (
    options: HandoffPackageOptions
  ) => Promise<{
    ok: boolean;
    path?: string;
    preview: HandoffPackagePreview;
    error?: string;
  }>;
  getTargets: () => Promise<string[]>;
  setTargets: (targets: string[]) => Promise<string[]>;
};
