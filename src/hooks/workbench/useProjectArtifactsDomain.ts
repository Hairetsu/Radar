import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import type {
  HandoffPackagePreview,
  LocalContext,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectBundleRedactionProfile,
  ProjectNote,
  ReplayTabState,
  SavedView,
  SavedViewTarget
} from "../../types";
import type { WorkView } from "./viewMeta";
import { viewMeta } from "./viewMeta";

interface SavedViewSnapshot {
  activeView: WorkView;
  trafficQuery: string;
  webSocketQuery: string;
  trafficMethodFilter: string;
  trafficTypeFilter: string;
  selectedCaptureId: string;
  selectedFindingId: string;
  selectedWorkflowId: string;
  selectedWorkflowRunId: string;
  replayTabState: ReplayTabState;
  sitemapNodeId: string;
  diffBaselineSessionId: string;
  automateSessionId: string;
}

interface ProjectArtifactsPorts {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setTrafficSearch: (query: string) => void;
  setWebSocketSearch: (query: string) => void;
  setTrafficMethodFilter: (value: string) => void;
  setTrafficTypeFilter: (value: string) => void;
  setSelectedId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectionAnchorRef: MutableRefObject<string>;
  setSelectedFindingId: (id: string) => void;
  setSelectedWorkflowId: (id: string) => void;
  setSelectedWorkflowRunId: (id: string) => void;
  setSelectedSitemapNodeId: (id: string) => void;
  setDiffBaselineSessionId: (id: string) => void;
  setActiveAutomateSessionId: (id: string) => void;
  selectReplayTab: (id: string) => void | Promise<void>;
  applyLocalContext: (context: LocalContext, noticeText?: string) => Promise<void>;
}

export function useProjectArtifactsDomain(
  contextKey: string,
  snapshot: SavedViewSnapshot,
  ports: ProjectArtifactsPorts
) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const [projectArtifactsOpen, setProjectArtifactsOpen] = useState(false);
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);
  const [selectedProjectNoteId, setSelectedProjectNoteId] = useState("");
  const [projectNoteTitle, setProjectNoteTitle] = useState("");
  const [projectNoteBody, setProjectNoteBody] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViewDescription, setSavedViewDescription] = useState("");
  const [bundleRedaction, setBundleRedaction] =
    useState<ProjectBundleRedactionProfile>("redacted-evidence");
  const [bundleIncludeReplayCollections, setBundleIncludeReplayCollections] = useState(true);
  const [bundleIncludePlugins, setBundleIncludePlugins] = useState(false);
  const [bundleExportPreview, setBundleExportPreview] =
    useState<ProjectBundleExportPreview | null>(null);
  const [bundleImportPath, setBundleImportPath] = useState("");
  const [bundleImportPreview, setBundleImportPreview] =
    useState<ProjectBundleImportPreview | null>(null);
  const [bundleActionPending, setBundleActionPending] = useState(false);
  const [handoffTitle, setHandoffTitle] = useState("");
  const [handoffIncludeDraftFindings, setHandoffIncludeDraftFindings] = useState(false);
  const [handoffIncludeProjectNotes, setHandoffIncludeProjectNotes] = useState(true);
  const [handoffIncludeWorkflows, setHandoffIncludeWorkflows] = useState(true);
  const [handoffPreview, setHandoffPreview] = useState<HandoffPackagePreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [notes, views] = await Promise.all([
        window.radar?.getProjectNotes?.() ?? [],
        window.radar?.getSavedViews?.() ?? []
      ]);
      if (cancelled) {
        return;
      }
      setProjectNotes(notes);
      setSelectedProjectNoteId(notes[0]?.id || "");
      setProjectNoteTitle(notes[0]?.title || "");
      setProjectNoteBody(notes[0]?.body || "");
      setSavedViews(views);
      setSavedViewName("");
      setSavedViewDescription("");
      setBundleExportPreview(null);
      setBundleImportPath("");
      setBundleImportPreview(null);
      setHandoffTitle("");
      setHandoffPreview(null);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [contextKey]);

  const selectedProjectNote = useMemo(
    () => projectNotes.find((note) => note.id === selectedProjectNoteId) || null,
    [projectNotes, selectedProjectNoteId]
  );

  const selectProjectNote = useCallback((noteId: string) => {
    const note = projectNotes.find((item) => item.id === noteId) || null;
    setSelectedProjectNoteId(note?.id || "");
    setProjectNoteTitle(note?.title || "");
    setProjectNoteBody(note?.body || "");
  }, [projectNotes]);

  const startProjectNote = useCallback(() => {
    setSelectedProjectNoteId("");
    setProjectNoteTitle("");
    setProjectNoteBody("");
  }, []);

  const saveProjectNote = useCallback(async () => {
    if (!window.radar?.saveProjectNote) {
      portsRef.current.setNotice("Run in Electron to save project notes.");
      return null;
    }
    const title = projectNoteTitle.trim();
    const body = projectNoteBody.trim();
    if (!title && !body) {
      portsRef.current.setNotice("Add a title or body before saving a project note.");
      return null;
    }
    const now = new Date().toISOString();
    const existing = projectNotes.find((note) => note.id === selectedProjectNoteId);
    const saved = await window.radar.saveProjectNote({
      id: existing?.id || `note-${Date.now()}`,
      title,
      body,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    setProjectNotes((items) => [saved, ...items.filter((note) => note.id !== saved.id)]);
    setSelectedProjectNoteId(saved.id);
    setProjectNoteTitle(saved.title);
    setProjectNoteBody(saved.body);
    portsRef.current.setNotice(`Project note saved: ${saved.title}`);
    return saved;
  }, [projectNoteBody, projectNoteTitle, projectNotes, selectedProjectNoteId]);

  const deleteProjectNote = useCallback(async (noteId = selectedProjectNoteId) => {
    if (!noteId || !window.radar?.deleteProjectNote) {
      return;
    }
    const result = await window.radar.deleteProjectNote(noteId);
    setProjectNotes(result.notes);
    const next = result.notes[0] || null;
    setSelectedProjectNoteId(next?.id || "");
    setProjectNoteTitle(next?.title || "");
    setProjectNoteBody(next?.body || "");
    portsRef.current.setNotice(result.ok ? "Project note deleted" : "Project note delete failed");
  }, [selectedProjectNoteId]);

  const currentSavedViewState = useCallback(() => {
    const current = snapshotRef.current;
    const entries: Array<[string, string | undefined]> = [
      ["trafficQuery", current.trafficQuery],
      ["webSocketQuery", current.webSocketQuery],
      ["trafficMethodFilter", current.trafficMethodFilter === "all" ? "" : current.trafficMethodFilter],
      ["trafficTypeFilter", current.trafficTypeFilter === "all" ? "" : current.trafficTypeFilter],
      ["selectedCaptureId", current.selectedCaptureId],
      ["selectedFindingId", current.selectedFindingId],
      ["selectedWorkflowId", current.selectedWorkflowId],
      ["selectedWorkflowRunId", current.selectedWorkflowRunId],
      ["replayTabId", current.replayTabState.activeTabId],
      ["sitemapNodeId", current.sitemapNodeId],
      ["diffBaselineSessionId", current.diffBaselineSessionId],
      ["automateSessionId", current.automateSessionId]
    ];
    return Object.fromEntries(entries.filter(([, value]) => Boolean(value))) as Record<string, string>;
  }, []);

  const saveCurrentView = useCallback(async () => {
    if (!window.radar?.saveSavedView) {
      portsRef.current.setNotice("Run in Electron to save project views.");
      return null;
    }
    const now = new Date().toISOString();
    const activeView = snapshotRef.current.activeView;
    const name =
      savedViewName.trim() || `${viewMeta[activeView].title} ${now.slice(0, 16).replace("T", " ")}`;
    const saved = await window.radar.saveSavedView({
      id: `view-${Date.now()}`,
      name,
      view: activeView as SavedViewTarget,
      description: savedViewDescription.trim(),
      state: currentSavedViewState(),
      createdAt: now,
      updatedAt: now
    });
    setSavedViews((items) => [saved, ...items.filter((view) => view.id !== saved.id)]);
    setSavedViewName("");
    setSavedViewDescription("");
    portsRef.current.setNotice(`Saved view: ${saved.name}`);
    return saved;
  }, [currentSavedViewState, savedViewDescription, savedViewName]);

  const applySavedView = useCallback((view: SavedView) => {
    const state = view.state;
    const currentPorts = portsRef.current;
    currentPorts.setActiveView(view.view);
    if (state.trafficQuery !== undefined) {
      currentPorts.setTrafficSearch(state.trafficQuery);
    }
    if (state.webSocketQuery !== undefined) {
      currentPorts.setWebSocketSearch(state.webSocketQuery);
    }
    currentPorts.setTrafficMethodFilter(state.trafficMethodFilter || "all");
    currentPorts.setTrafficTypeFilter(state.trafficTypeFilter || "all");
    if (state.selectedCaptureId) {
      currentPorts.setSelectedId(state.selectedCaptureId);
      currentPorts.setSelectedIds([state.selectedCaptureId]);
      currentPorts.selectionAnchorRef.current = state.selectedCaptureId;
    }
    if (state.selectedFindingId) {
      currentPorts.setSelectedFindingId(state.selectedFindingId);
    }
    if (state.selectedWorkflowId) {
      currentPorts.setSelectedWorkflowId(state.selectedWorkflowId);
    }
    if (state.selectedWorkflowRunId) {
      currentPorts.setSelectedWorkflowRunId(state.selectedWorkflowRunId);
    }
    if (state.sitemapNodeId) {
      currentPorts.setSelectedSitemapNodeId(state.sitemapNodeId);
    }
    if (state.diffBaselineSessionId) {
      currentPorts.setDiffBaselineSessionId(state.diffBaselineSessionId);
    }
    if (state.automateSessionId) {
      currentPorts.setActiveAutomateSessionId(state.automateSessionId);
    }
    if (
      state.replayTabId &&
      snapshotRef.current.replayTabState.tabs.some((tab) => tab.id === state.replayTabId)
    ) {
      void currentPorts.selectReplayTab(state.replayTabId);
    }
    setProjectArtifactsOpen(false);
    currentPorts.setNotice(`Opened saved view: ${view.name}`);
  }, []);

  const deleteSavedView = useCallback(async (viewId: string) => {
    if (!viewId || !window.radar?.deleteSavedView) {
      return;
    }
    const result = await window.radar.deleteSavedView(viewId);
    setSavedViews(result.views);
    portsRef.current.setNotice(result.ok ? "Saved view deleted" : "Saved view delete failed");
  }, []);

  const projectBundleOptions = useMemo(
    () => ({
      redaction: bundleRedaction,
      includeReplayCollections: bundleIncludeReplayCollections,
      includePlugins: bundleIncludePlugins
    }),
    [bundleIncludePlugins, bundleIncludeReplayCollections, bundleRedaction]
  );

  const previewProjectBundleExport = useCallback(async () => {
    if (!window.radar?.previewProjectBundleExport) {
      portsRef.current.setNotice("Run in Electron to preview project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewProjectBundleExport(projectBundleOptions);
      setBundleExportPreview(preview);
      portsRef.current.setNotice(
        preview.ok ? "Project bundle export preview ready" : preview.error || "Project bundle preview failed"
      );
      return preview;
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Project bundle preview failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [projectBundleOptions]);

  const writeProjectBundle = useCallback(async () => {
    if (!window.radar?.writeProjectBundle) {
      portsRef.current.setNotice("Run in Electron to export project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.writeProjectBundle(projectBundleOptions);
      setBundleExportPreview(result.preview);
      portsRef.current.setNotice(
        result.ok
          ? `Project bundle exported${result.path ? `: ${result.path}` : ""}`
          : result.error || "Project bundle export failed"
      );
      return result;
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Project bundle export failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [projectBundleOptions]);

  const previewProjectBundleImport = useCallback(async () => {
    if (!window.radar?.previewProjectBundleImport) {
      portsRef.current.setNotice("Run in Electron to preview project bundle imports.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewProjectBundleImport({
        sourcePath: bundleImportPath.trim() || undefined
      });
      setBundleImportPreview(preview);
      portsRef.current.setNotice(
        preview.ok
          ? "Project bundle import preview ready"
          : preview.error || "Project bundle import preview failed"
      );
      return preview;
    } catch (error) {
      portsRef.current.setNotice(
        error instanceof Error ? error.message : "Project bundle import preview failed"
      );
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [bundleImportPath]);

  const applyProjectBundleImport = useCallback(async () => {
    if (!window.radar?.applyProjectBundleImport) {
      portsRef.current.setNotice("Run in Electron to import project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.applyProjectBundleImport({
        sourcePath: bundleImportPath.trim() || undefined
      });
      portsRef.current.setNotice(result.message);
      if (result.ok && window.radar.getLocalContext) {
        await portsRef.current.applyLocalContext(await window.radar.getLocalContext());
      }
      return result;
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Project bundle import failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [bundleImportPath]);

  const handoffOptions = useMemo(
    () => ({
      title: handoffTitle,
      redaction: bundleRedaction,
      includeDraftFindings: handoffIncludeDraftFindings,
      includeProjectNotes: handoffIncludeProjectNotes,
      includeReplayCollections: bundleIncludeReplayCollections,
      includeWorkflows: handoffIncludeWorkflows
    }),
    [
      bundleIncludeReplayCollections,
      bundleRedaction,
      handoffIncludeDraftFindings,
      handoffIncludeProjectNotes,
      handoffIncludeWorkflows,
      handoffTitle
    ]
  );

  const previewHandoffPackage = useCallback(async () => {
    if (!window.radar?.previewHandoffPackage) {
      portsRef.current.setNotice("Run in Electron to preview handoff packages.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewHandoffPackage(handoffOptions);
      setHandoffPreview(preview);
      portsRef.current.setNotice(
        preview.ok ? "Handoff package preview ready" : preview.error || "Handoff preview failed"
      );
      return preview;
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Handoff preview failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [handoffOptions]);

  const writeHandoffPackage = useCallback(async () => {
    if (!window.radar?.writeHandoffPackage) {
      portsRef.current.setNotice("Run in Electron to export handoff packages.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.writeHandoffPackage(handoffOptions);
      setHandoffPreview(result.preview);
      portsRef.current.setNotice(
        result.ok
          ? `Handoff package exported${result.path ? `: ${result.path}` : ""}`
          : result.error || "Handoff export failed"
      );
      return result;
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Handoff export failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [handoffOptions]);

  return {
    projectArtifactsOpen,
    setProjectArtifactsOpen,
    projectNotes,
    setProjectNotes,
    selectedProjectNoteId,
    setSelectedProjectNoteId,
    selectedProjectNote,
    projectNoteTitle,
    setProjectNoteTitle,
    projectNoteBody,
    setProjectNoteBody,
    selectProjectNote,
    startProjectNote,
    saveProjectNote,
    deleteProjectNote,
    savedViews,
    setSavedViews,
    savedViewName,
    setSavedViewName,
    savedViewDescription,
    setSavedViewDescription,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    bundleRedaction,
    setBundleRedaction,
    bundleIncludeReplayCollections,
    setBundleIncludeReplayCollections,
    bundleIncludePlugins,
    setBundleIncludePlugins,
    bundleExportPreview,
    setBundleExportPreview,
    bundleImportPath,
    setBundleImportPath,
    bundleImportPreview,
    setBundleImportPreview,
    bundleActionPending,
    handoffTitle,
    setHandoffTitle,
    handoffIncludeDraftFindings,
    setHandoffIncludeDraftFindings,
    handoffIncludeProjectNotes,
    setHandoffIncludeProjectNotes,
    handoffIncludeWorkflows,
    setHandoffIncludeWorkflows,
    handoffPreview,
    setHandoffPreview,
    previewProjectBundleExport,
    writeProjectBundle,
    previewProjectBundleImport,
    applyProjectBundleImport,
    previewHandoffPackage,
    writeHandoffPackage
  };
}
