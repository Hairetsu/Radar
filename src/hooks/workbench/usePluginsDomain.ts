import { useCallback, useMemo, useState } from "react";
import { normalizePluginApiRequest } from "../../../shared/plugins.js";
import type {
  InstalledPlugin,
  PluginApiResult,
  PluginAuditEntry,
  PluginDeveloperValidation,
  PluginInstallPreview,
  PluginPanelRender,
  PluginPermission,
  PluginInstallStatus
} from "../../types";
import type { NoticePort } from "./ports";

export type PluginsDomain = ReturnType<typeof usePluginsDomain>;

export function usePluginsDomain(ports: NoticePort) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginInstallPath, setPluginInstallPath] = useState("");
  const [pluginInstallPreview, setPluginInstallPreview] = useState<PluginInstallPreview | null>(null);
  const [pluginAudit, setPluginAudit] = useState<PluginAuditEntry[]>([]);
  const [pluginApiRequestText, setPluginApiRequestText] = useState("");
  const [pluginApiResult, setPluginApiResult] = useState<PluginApiResult | null>(null);
  const [pluginPanelRender, setPluginPanelRender] = useState<PluginPanelRender | null>(null);
  const [pluginDeveloperValidation, setPluginDeveloperValidation] = useState<PluginDeveloperValidation | null>(null);

  const approvedPlugins = useMemo(() => plugins.filter((plugin) => plugin.status === "approved"), [plugins]);

  const previewPluginInstall = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.previewPluginInstall) {
      ports.setNotice("Enter a local plugin folder before previewing.");
      return null;
    }
    try {
      const preview = await window.radar.previewPluginInstall(pluginInstallPath.trim());
      setPluginInstallPreview(preview);
      ports.setNotice(`Plugin preview ready: ${preview.manifest.name}`);
      return preview;
    } catch (error) {
      setPluginInstallPreview(null);
      ports.setNotice(error instanceof Error ? error.message : "Plugin preview failed");
      return null;
    }
  }, [pluginInstallPath, ports]);

  const installPlugin = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.installPlugin) {
      ports.setNotice("Enter a local plugin folder before installing.");
      return null;
    }
    try {
      const plugin = await window.radar.installPlugin(pluginInstallPath.trim());
      const nextPlugins = await (window.radar.getPlugins?.() ?? Promise.resolve([plugin]));
      setPlugins(nextPlugins);
      setPluginInstallPreview(null);
      ports.setNotice(`Plugin installed pending approval: ${plugin.manifest.name}`);
      return plugin;
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Plugin install failed");
      return null;
    }
  }, [pluginInstallPath, ports]);

  const approvePlugin = useCallback(
    async (pluginId: string, permissions: PluginPermission[]) => {
      if (!pluginId || !window.radar?.approvePlugin) {
        ports.setNotice("Run in Electron to approve plugins.");
        return null;
      }
      try {
        const plugin = await window.radar.approvePlugin({ id: pluginId, permissions });
        setPlugins((items) => [plugin, ...items.filter((item) => item.id !== plugin.id)]);
        ports.setNotice(`Plugin approved: ${plugin.manifest.name}`);
        return plugin;
      } catch (error) {
        ports.setNotice(error instanceof Error ? error.message : "Plugin approval failed");
        return null;
      }
    },
    [ports]
  );

  const setPluginStatus = useCallback(
    async (pluginId: string, status: PluginInstallStatus) => {
      if (!pluginId || !window.radar?.setPluginStatus) {
        ports.setNotice("Run in Electron to update plugin status.");
        return null;
      }
      try {
        const plugin = await window.radar.setPluginStatus({ id: pluginId, status });
        setPlugins((items) => [plugin, ...items.filter((item) => item.id !== plugin.id)]);
        ports.setNotice(`Plugin ${status}: ${plugin.manifest.name}`);
        return plugin;
      } catch (error) {
        ports.setNotice(error instanceof Error ? error.message : "Plugin status update failed");
        return null;
      }
    },
    [ports]
  );

  const removePlugin = useCallback(
    async (pluginId: string) => {
      if (!pluginId || !window.radar?.removePlugin) {
        ports.setNotice("Run in Electron to remove plugins.");
        return null;
      }
      try {
        const result = await window.radar.removePlugin(pluginId);
        setPlugins(result.plugins);
        ports.setNotice(result.ok ? "Plugin removed" : "Plugin remove failed");
        return result;
      } catch (error) {
        ports.setNotice(error instanceof Error ? error.message : "Plugin remove failed");
        return null;
      }
    },
    [ports]
  );

  const refreshPluginAudit = useCallback(async () => {
    if (!window.radar?.getPluginAudit) {
      setPluginAudit([]);
      return [];
    }
    const audit = await window.radar.getPluginAudit();
    setPluginAudit(audit);
    return audit;
  }, []);

  const runPluginApiRequest = useCallback(async () => {
    if (!window.radar?.runPluginApiAction) {
      ports.setNotice("Run in Electron to execute plugin API actions.");
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(pluginApiRequestText || "{}");
      const request = normalizePluginApiRequest(parsed);
      if (!request) {
        throw new Error("Plugin API request needs a pluginId, supported action, and object input.");
      }
      const result = await window.radar.runPluginApiAction(request);
      setPluginApiResult(result);
      await refreshPluginAudit();
      ports.setNotice(result.ok ? `Plugin action complete: ${result.action}` : result.error || "Plugin action failed");
      return result;
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Plugin API request must be valid JSON.");
      return null;
    }
  }, [pluginApiRequestText, refreshPluginAudit, ports]);

  const renderPluginPanel = useCallback(
    async (pluginId: string, panelId: string) => {
      if (!pluginId || !panelId || !window.radar?.renderPluginPanel) {
        ports.setNotice("Run in Electron to render plugin panels.");
        return null;
      }
      const render = await window.radar.renderPluginPanel({ pluginId, panelId });
      setPluginPanelRender(render);
      await refreshPluginAudit();
      ports.setNotice(render.ok ? `Panel ready: ${render.title}` : render.error || "Plugin panel render failed");
      return render;
    },
    [refreshPluginAudit, ports]
  );

  const validatePluginDeveloperSource = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.validatePlugin) {
      ports.setNotice("Enter a local plugin folder before validation.");
      return null;
    }
    const validation = await window.radar.validatePlugin(pluginInstallPath.trim());
    setPluginDeveloperValidation(validation);
    await refreshPluginAudit();
    ports.setNotice(validation.ok ? "Plugin developer validation passed" : "Plugin developer validation failed");
    return validation;
  }, [pluginInstallPath, refreshPluginAudit, ports]);

  return {
    plugins,
    setPlugins,
    approvedPlugins,
    pluginInstallPath,
    setPluginInstallPath,
    pluginInstallPreview,
    setPluginInstallPreview,
    previewPluginInstall,
    installPlugin,
    approvePlugin,
    setPluginStatus,
    removePlugin,
    pluginAudit,
    setPluginAudit,
    refreshPluginAudit,
    pluginApiRequestText,
    setPluginApiRequestText,
    pluginApiResult,
    setPluginApiResult,
    runPluginApiRequest,
    pluginPanelRender,
    setPluginPanelRender,
    renderPluginPanel,
    pluginDeveloperValidation,
    setPluginDeveloperValidation,
    validatePluginDeveloperSource
  };
}
