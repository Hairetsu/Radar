import fs from "node:fs";
import path from "node:path";
import { isAllowedTarget } from "../../shared/allowlist.js";
import type { LocalContext } from "../../shared/domain.js";
import {
  buildProjectBundle,
  parseProjectBundleJson,
  previewProjectBundleImport,
  serializeProjectBundle,
  type ProjectBundle,
  type ProjectBundleApplyResult,
  type ProjectBundleOptions
} from "../../shared/projectBundle.js";
import {
  buildHandoffPackage,
  serializeHandoffPackage,
  type HandoffPackageOptions
} from "../../shared/handoffPackage.js";
import type { LocalStore } from "../localStore.js";

type FilePrompt = (input: {
  title: string;
  defaultPath?: string;
  extensions: string[];
}) => Promise<string | null>;

type ProjectArtifactControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  setContext: (context: LocalContext) => void;
  allowlist: () => string[];
  setAllowlist: (targets: string[]) => void;
  artifactPath: string;
  promptSave: FilePrompt;
  promptOpen: FilePrompt;
};

function normalizeBundleOptions(input: unknown): ProjectBundleOptions {
  const payload =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const redaction =
    payload.redaction === "metadata-only" ||
    payload.redaction === "reviewed-findings" ||
    payload.redaction === "raw-evidence"
      ? payload.redaction
      : "redacted-evidence";
  return {
    redaction,
    includePlugins: payload.includePlugins === true,
    includeReplayCollections: payload.includeReplayCollections !== false
  };
}

function bundleFilePath(input: unknown) {
  const payload =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const sourcePath = String(payload.sourcePath || "").trim();
  if (!sourcePath) {
    return "";
  }
  const resolved = path.resolve(sourcePath);
  if (
    !resolved.endsWith(".json") &&
    !resolved.endsWith(".radar-bundle.json")
  ) {
    throw new Error(
      "Project bundle path must end in .json or .radar-bundle.json."
    );
  }
  return resolved;
}

function readBundleFromPath(sourcePath: string): ProjectBundle {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) {
    throw new Error("Project bundle path is not a file.");
  }
  const parsed = parseProjectBundleJson(
    fs.readFileSync(sourcePath, "utf8")
  );
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.bundle;
}

function zeroBundleStats() {
  return {
    sessions: 0,
    captures: 0,
    webSocketEvents: 0,
    findings: 0,
    workflows: 0,
    projectNotes: 0,
    savedViews: 0,
    replayCollections: 0,
    plugins: 0,
    proposedTargets: 0
  };
}

export function createProjectArtifactController(
  deps: ProjectArtifactControllerDeps
) {
  function activeBundleInput(options: ProjectBundleOptions) {
    const context = deps.context();
    const store = deps.store();
    const sessionId = context.session.id;
    const workspaceId = context.workspace.id;
    const targets = deps.allowlist();
    return {
      profile: context.profile,
      workspace: context.workspace,
      targets: store.getTargets(workspaceId),
      savedFilters: store.listSavedFilters(workspaceId),
      projectNotes: store.listProjectNotes(workspaceId),
      savedViews: store.listSavedViews(workspaceId),
      workflows: store.listWorkflowDefinitions(workspaceId),
      replayCollections:
        options.includeReplayCollections === false
          ? []
          : store.listReplayCollections(workspaceId),
      plugins: options.includePlugins
        ? store.listPlugins(workspaceId)
        : [],
      sessions: [
        {
          session: context.session,
          captures: store
            .listCaptures(sessionId, 2000)
            .filter(
              (capture) =>
                capture.allowed &&
                isAllowedTarget(capture.url, targets)
            ),
          webSocketEvents: store
            .listWebSocketEvents(sessionId, 5000)
            .filter(
              (event) =>
                event.allowed && isAllowedTarget(event.url, targets)
            ),
          evidenceAnnotations:
            store.listEvidenceAnnotations(sessionId),
          findings: store.listFindings(sessionId),
          workflowRuns: store.listWorkflowRuns(sessionId, 200)
        }
      ]
    };
  }

  function previewBundleExport(input: unknown) {
    const options = normalizeBundleOptions(input);
    return buildProjectBundle(activeBundleInput(options), options);
  }

  async function writeBundle(input: unknown) {
    const preview = previewBundleExport(input);
    if (!preview.ok || !preview.bundle) {
      return {
        ok: false,
        preview,
        error:
          preview.error || "Project bundle could not be built."
      };
    }
    const defaultPath = `${deps
      .context()
      .profile.name.replace(
        /[^a-zA-Z0-9_.-]/g,
        "-"
      )}.radar-bundle.json`;
    const outputPath = deps.artifactPath
      ? path.join(path.resolve(deps.artifactPath), defaultPath)
      : await deps.promptSave({
          title: "Export Radar Project Bundle",
          defaultPath,
          extensions: ["radar-bundle.json", "json"]
        });
    if (!outputPath) {
      return {
        ok: false,
        preview,
        error: "Project bundle export was cancelled."
      };
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      serializeProjectBundle(preview.bundle),
      "utf8"
    );
    return { ok: true, path: outputPath, preview };
  }

  async function readBundleForImport(input: unknown) {
    const sourcePath =
      bundleFilePath(input) ||
      (await deps.promptOpen({
        title: "Import Radar Project Bundle",
        extensions: ["radar-bundle.json", "json"]
      }));
    if (!sourcePath) {
      throw new Error("Project bundle import was cancelled.");
    }
    return readBundleFromPath(sourcePath);
  }

  async function previewBundleImport(input: unknown) {
    const bundle = await readBundleForImport(input);
    const context = deps.context();
    const store = deps.store();
    return previewProjectBundleImport({
      bundle,
      activeTargets: store.getTargets(context.workspace.id),
      existingCaptures: store.listCaptures(context.session.id, 2000),
      existingWebSocketEvents: store.listWebSocketEvents(
        context.session.id,
        5000
      ),
      existingFindings: store.listFindings(context.session.id),
      existingWorkflows: store.listWorkflowDefinitions(
        context.workspace.id
      ),
      existingProjectNotes: store.listProjectNotes(
        context.workspace.id
      ),
      existingSavedViews: store.listSavedViews(context.workspace.id)
    });
  }

  function importWorkspaceRecords(
    bundle: ProjectBundle,
    imported: ReturnType<typeof zeroBundleStats>,
    skipped: ReturnType<typeof zeroBundleStats>
  ) {
    const store = deps.store();
    const workspaceId = deps.context().workspace.id;
    const existingFilters = store.listSavedFilters(workspaceId);
    store.setSavedFilters(workspaceId, [
      ...existingFilters,
      ...bundle.savedFilters.filter(
        (filter) =>
          !existingFilters.some((item) => item.id === filter.id)
      )
    ]);

    const existingNoteIds = new Set(
      store.listProjectNotes(workspaceId).map((note) => note.id)
    );
    for (const note of bundle.projectNotes) {
      if (existingNoteIds.has(note.id)) {
        skipped.projectNotes += 1;
      } else {
        store.upsertProjectNote(workspaceId, note);
        existingNoteIds.add(note.id);
        imported.projectNotes += 1;
      }
    }

    const existingViewIds = new Set(
      store.listSavedViews(workspaceId).map((view) => view.id)
    );
    for (const view of bundle.savedViews) {
      if (existingViewIds.has(view.id)) {
        skipped.savedViews += 1;
      } else {
        store.upsertSavedView(workspaceId, view);
        existingViewIds.add(view.id);
        imported.savedViews += 1;
      }
    }

    const existingWorkflowIds = new Set(
      store
        .listWorkflowDefinitions(workspaceId)
        .map((workflow) => workflow.id)
    );
    for (const workflow of bundle.workflows) {
      if (existingWorkflowIds.has(workflow.id)) {
        skipped.workflows += 1;
      } else {
        store.upsertWorkflowDefinition(workspaceId, workflow);
        existingWorkflowIds.add(workflow.id);
        imported.workflows += 1;
      }
    }

    const existingCollections =
      store.listReplayCollections(workspaceId);
    const collectionIds = new Set(
      existingCollections.map((collection) => collection.id)
    );
    const newCollections = bundle.replayCollections.filter(
      (collection) => {
        if (collectionIds.has(collection.id)) {
          skipped.replayCollections += 1;
          return false;
        }
        collectionIds.add(collection.id);
        return true;
      }
    );
    if (newCollections.length > 0) {
      store.setReplayCollections(workspaceId, [
        ...existingCollections,
        ...newCollections
      ]);
      imported.replayCollections = newCollections.length;
    }

    const pluginIds = new Set(
      store.listPlugins(workspaceId).map((plugin) => plugin.id)
    );
    for (const plugin of bundle.plugins) {
      if (pluginIds.has(plugin.id)) {
        skipped.plugins += 1;
      } else {
        store.upsertPlugin(workspaceId, plugin);
        pluginIds.add(plugin.id);
        imported.plugins += 1;
      }
    }
  }

  function importSessionRecords(
    bundle: ProjectBundle,
    imported: ReturnType<typeof zeroBundleStats>,
    skipped: ReturnType<typeof zeroBundleStats>
  ) {
    const store = deps.store();
    const context = deps.context();
    for (const bundleSession of bundle.sessions) {
      const session = store.createSession(
        context.workspace.id,
        `Imported ${bundleSession.session.name}`
      );
      imported.sessions += 1;
      const captureIds = new Set<string>();
      for (const capture of bundleSession.captures) {
        if (captureIds.has(capture.id)) {
          skipped.captures += 1;
        } else {
          store.upsertCapture(session.id, capture);
          captureIds.add(capture.id);
          imported.captures += 1;
        }
      }
      const webSocketIds = new Set<string>();
      for (const event of bundleSession.webSocketEvents) {
        if (webSocketIds.has(event.id)) {
          skipped.webSocketEvents += 1;
        } else {
          store.insertWebSocketEvent(session.id, event);
          webSocketIds.add(event.id);
          imported.webSocketEvents += 1;
        }
      }
      if (bundleSession.evidenceAnnotations.length > 0) {
        store.saveEvidenceAnnotations(
          session.id,
          bundleSession.evidenceAnnotations
        );
      }
      const findingIds = new Set<string>();
      for (const finding of bundleSession.findings) {
        if (findingIds.has(finding.id)) {
          skipped.findings += 1;
        } else {
          store.upsertFinding(session.id, finding);
          findingIds.add(finding.id);
          imported.findings += 1;
        }
      }
      for (const run of bundleSession.workflowRuns) {
        store.upsertWorkflowRun(session.id, {
          ...run,
          sessionId: session.id
        });
      }
      deps.setContext({ ...context, session });
    }
  }

  async function applyBundleImport(
    input: unknown
  ): Promise<ProjectBundleApplyResult> {
    const preview = await previewBundleImport(input);
    if (!preview.ok || !preview.bundle) {
      return {
        ok: false,
        imported: zeroBundleStats(),
        skipped: zeroBundleStats(),
        proposedTargets: [],
        message:
          preview.error || "Project bundle import preview failed."
      };
    }
    const imported = zeroBundleStats();
    const skipped = zeroBundleStats();
    importWorkspaceRecords(preview.bundle, imported, skipped);
    importSessionRecords(preview.bundle, imported, skipped);
    imported.proposedTargets = preview.proposedTargets.length;
    deps.setAllowlist(
      deps.store().getTargets(deps.context().workspace.id)
    );
    return {
      ok: true,
      imported,
      skipped,
      proposedTargets: preview.proposedTargets,
      message:
        preview.proposedTargets.length > 0
          ? "Bundle imported. Proposed scope targets were left inactive."
          : "Bundle imported."
    };
  }

  function normalizeHandoffOptions(
    input: unknown
  ): HandoffPackageOptions {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const bundleOptions = normalizeBundleOptions(payload);
    return {
      title: String(payload.title || "").trim().slice(0, 180),
      redaction: bundleOptions.redaction,
      includeDraftFindings: payload.includeDraftFindings === true,
      includeProjectNotes: payload.includeProjectNotes !== false,
      includeReplayCollections:
        payload.includeReplayCollections !== false,
      includeWorkflows: payload.includeWorkflows !== false
    };
  }

  function previewHandoff(input: unknown) {
    const options = normalizeHandoffOptions(input);
    const context = deps.context();
    const store = deps.store();
    const sessionId = context.session.id;
    const workspaceId = context.workspace.id;
    const targets = deps.allowlist();
    return buildHandoffPackage(
      {
        profile: context.profile,
        workspace: context.workspace,
        session: context.session,
        targets: store.getTargets(workspaceId),
        captures: store
          .listCaptures(sessionId, 2000)
          .filter(
            (capture) =>
              capture.allowed &&
              isAllowedTarget(capture.url, targets)
          ),
        webSocketEvents: store
          .listWebSocketEvents(sessionId, 5000)
          .filter(
            (event) =>
              event.allowed && isAllowedTarget(event.url, targets)
          ),
        findings: store.listFindings(sessionId),
        workflows:
          options.includeWorkflows === false
            ? []
            : store.listWorkflowDefinitions(workspaceId),
        replayCollections:
          options.includeReplayCollections === false
            ? []
            : store.listReplayCollections(workspaceId),
        projectNotes:
          options.includeProjectNotes === false
            ? []
            : store.listProjectNotes(workspaceId)
      },
      options
    );
  }

  async function writeHandoff(input: unknown) {
    const preview = previewHandoff(input);
    if (!preview.ok || !preview.package) {
      return {
        ok: false,
        preview,
        error:
          preview.error || "Handoff package could not be built."
      };
    }
    const defaultPath = `${preview.package.title.replace(
      /[^a-zA-Z0-9_.-]/g,
      "-"
    )}.radar-handoff.json`;
    const outputPath = deps.artifactPath
      ? path.join(path.resolve(deps.artifactPath), defaultPath)
      : await deps.promptSave({
          title: "Export Radar Handoff Package",
          defaultPath,
          extensions: ["radar-handoff.json", "json"]
        });
    if (!outputPath) {
      return {
        ok: false,
        preview,
        error: "Handoff package export was cancelled."
      };
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      serializeHandoffPackage(preview.package),
      "utf8"
    );
    return { ok: true, path: outputPath, preview };
  }

  return {
    previewBundleExport,
    writeBundle,
    previewBundleImport,
    applyBundleImport,
    previewHandoff,
    writeHandoff
  };
}
