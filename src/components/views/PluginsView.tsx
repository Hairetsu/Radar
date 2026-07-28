import { History, Play, Plug, Search, ShieldCheck, Square, Terminal, Trash2, X } from "lucide-react";
import type { PluginsDomain } from "../../hooks/workbench/usePluginsDomain";
import { pluginStatusTone, pluginTrustTone } from "../../lib";
import { EmptyState, FieldLabel, StatusBadge } from "../radar/primitives";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export type PluginsViewProps = Pick<
  PluginsDomain,
  | "plugins"
  | "approvedPlugins"
  | "pluginInstallPath"
  | "setPluginInstallPath"
  | "previewPluginInstall"
  | "validatePluginDeveloperSource"
  | "installPlugin"
  | "pluginInstallPreview"
  | "pluginDeveloperValidation"
  | "approvePlugin"
  | "setPluginStatus"
  | "removePlugin"
  | "renderPluginPanel"
  | "pluginPanelRender"
  | "pluginApiRequestText"
  | "setPluginApiRequestText"
  | "runPluginApiRequest"
  | "pluginApiResult"
  | "refreshPluginAudit"
  | "pluginAudit"
>;

export function PluginsView({
  plugins,
  approvedPlugins,
  pluginInstallPath,
  setPluginInstallPath,
  previewPluginInstall,
  validatePluginDeveloperSource,
  installPlugin,
  pluginInstallPreview,
  pluginDeveloperValidation,
  approvePlugin,
  setPluginStatus,
  removePlugin,
  renderPluginPanel,
  pluginPanelRender,
  pluginApiRequestText,
  setPluginApiRequestText,
  runPluginApiRequest,
  pluginApiResult,
  refreshPluginAudit,
  pluginAudit
}: PluginsViewProps) {
  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(320px,0.48fr)_minmax(420px,1fr)] max-[1100px]:grid-cols-1">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_minmax(0,1fr)] max-[1100px]:border-r-0 max-[1100px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(3,minmax(0,1fr))]">
          {[
            ["Installed", plugins.length],
            ["Approved", approvedPlugins.length],
            ["Panels", approvedPlugins.reduce((total, plugin) => total + plugin.manifest.panels.length, 0)]
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
              <FieldLabel htmlFor="pluginInstallPath" className="px-0 pt-0">
                Local plugin source
              </FieldLabel>
              <Input
                id="pluginInstallPath"
                value={pluginInstallPath}
                onChange={(event) => setPluginInstallPath(event.target.value)}
                placeholder="/path/to/plugin or /path/to/plugin.json"
                data-testid="pluginInstallPath"
              />
              <div className="grid gap-2 md:grid-cols-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void previewPluginInstall()}
                  disabled={!pluginInstallPath.trim()}
                  data-testid="previewPlugin"
                >
                  <Search size={13} strokeWidth={1.7} />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void validatePluginDeveloperSource()}
                  disabled={!pluginInstallPath.trim()}
                  data-testid="validatePlugin"
                >
                  <ShieldCheck size={13} strokeWidth={1.7} />
                  Validate
                </Button>
                <Button
                  variant="solid"
                  type="button"
                  onClick={() => void installPlugin()}
                  disabled={!pluginInstallPath.trim()}
                  data-testid="installPlugin"
                >
                  <Plug size={13} strokeWidth={1.7} />
                  Install
                </Button>
              </div>
            </div>

            {pluginInstallPreview ? (
              <div className="grid gap-3 border border-rule bg-ink/25 p-3" data-testid="pluginInstallPreview">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="rd-eyebrow text-signal">
                      Manifest preview
                    </span>
                    <h2 className="mt-1 font-display text-head uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                      {pluginInstallPreview.manifest.name}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge>{pluginInstallPreview.manifest.version}</StatusBadge>
                    <StatusBadge tone={pluginTrustTone(pluginInstallPreview.trustLevel)}>
                      {pluginInstallPreview.trustLevel}
                    </StatusBadge>
                  </div>
                </div>
                <p className="text-body leading-6 text-copy">
                  {pluginInstallPreview.manifest.description || "No description supplied."}
                </p>
                <pre className="max-h-[92px] overflow-auto text-meta">
                  {[
                    `id: ${pluginInstallPreview.manifest.id}`,
                    `source: ${pluginInstallPreview.sourcePath}`,
                    `manifest: ${pluginInstallPreview.manifestPath}`,
                    `entry: ${pluginInstallPreview.manifest.entry || "panel-only"}`
                  ].join("\n")}
                </pre>
                <div className="flex flex-wrap gap-1.5">
                  {pluginInstallPreview.permissionSummary.map((permission) => (
                    <StatusBadge key={permission} tone="move">
                      {permission}
                    </StatusBadge>
                  ))}
                </div>
                {pluginInstallPreview.warnings.length > 0 && (
                  <div className="grid gap-1 border border-sand/30 bg-sand/10 p-2">
                    {pluginInstallPreview.warnings.map((warning) => (
                      <span key={warning} className="font-mono text-label uppercase tracking-key text-sand">
                        {warning}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState className="min-h-[170px] border border-dashed border-rule">
                <Plug size={18} strokeWidth={1.4} />
                <span>Preview a local manifest before installing.</span>
              </EmptyState>
            )}
            {pluginDeveloperValidation && (
              <div className="grid gap-1 border border-rule bg-surface/45 p-2" data-testid="pluginDeveloperValidation">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>Developer Validation</FieldLabel>
                  <StatusBadge tone={pluginDeveloperValidation.ok ? "good" : "danger"}>
                    {pluginDeveloperValidation.ok ? "passed" : "failed"}
                  </StatusBadge>
                </div>
                {[...pluginDeveloperValidation.errors, ...pluginDeveloperValidation.warnings].slice(0, 5).map((item) => (
                  <span key={item} className="font-mono text-label uppercase tracking-key text-muted">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 [grid-template-rows:minmax(0,0.95fr)_minmax(420px,0.7fr)]">
        <div className="min-h-0 overflow-auto radar-traffic-list" data-testid="pluginRegistry">
          {plugins.length === 0 && <EmptyState>No local plugins installed</EmptyState>}
          {plugins.map((plugin) => (
            <div key={plugin.id} className="grid gap-3 border-b border-rule bg-ink/20 p-4" data-testid={`pluginRow-${plugin.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={pluginStatusTone(plugin.status)}>{plugin.status}</StatusBadge>
                    <StatusBadge tone={pluginTrustTone(plugin.trustLevel || "local")}>{plugin.trustLevel || "local"}</StatusBadge>
                    <StatusBadge>{plugin.manifest.version}</StatusBadge>
                    <span className="rd-label text-muted">
                      {plugin.manifest.id}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-head uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                    {plugin.manifest.name}
                  </h3>
                  <p className="mt-2 max-w-[760px] text-body leading-6 text-copy">
                    {plugin.manifest.description || "Local extension installed from disk."}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="compact"
                    type="button"
                    onClick={() => void approvePlugin(plugin.id, plugin.manifest.permissions)}
                    disabled={plugin.status === "approved"}
                    data-testid={`approvePlugin-${plugin.id}`}
                  >
                    <ShieldCheck size={12} strokeWidth={1.7} />
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => void setPluginStatus(plugin.id, "disabled")}
                    disabled={plugin.status === "disabled"}
                    data-testid={`disablePlugin-${plugin.id}`}
                  >
                    <Square size={12} strokeWidth={1.7} />
                    Disable
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => void setPluginStatus(plugin.id, "blocked")}
                    disabled={plugin.status === "blocked"}
                    data-testid={`blockPlugin-${plugin.id}`}
                  >
                    <X size={12} strokeWidth={1.7} />
                    Block
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => void removePlugin(plugin.id)}
                    data-testid={`removePlugin-${plugin.id}`}
                  >
                    <Trash2 size={12} strokeWidth={1.7} />
                    Remove
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid gap-1">
                  <span className="rd-eyebrow text-muted">Requested</span>
                  <div className="flex flex-wrap gap-1.5">
                    {plugin.manifest.permissions.map((permission) => (
                      <StatusBadge key={permission} tone={plugin.grantedPermissions.includes(permission) ? "good" : "ghost"}>
                        {permission}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className="rd-eyebrow text-muted">Source</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta text-copy">
                    {plugin.sourcePath}
                  </span>
                </div>
              </div>
              {plugin.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {plugin.warnings.map((warning) => (
                    <StatusBadge key={warning} tone="warn">
                      {warning}
                    </StatusBadge>
                  ))}
                </div>
              )}
              {(plugin.compatibilityWarnings || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(plugin.compatibilityWarnings || []).map((warning) => (
                    <StatusBadge key={warning} tone="danger">
                      {warning}
                    </StatusBadge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="min-h-0 overflow-auto border-t border-rule p-4" data-testid="pluginPanels">
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1fr)_minmax(260px,0.8fr)]">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="rd-eyebrow text-signal">
                    Approved panels
                  </span>
                  <h2 className="mt-1 font-display text-head uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                    Sandbox
                  </h2>
                </div>
                <StatusBadge tone="move">{approvedPlugins.length} approved</StatusBadge>
              </div>
              <div className="grid max-h-[300px] gap-2 overflow-auto">
                {approvedPlugins.flatMap((plugin) =>
                  plugin.manifest.panels.map((panel) => (
                    <div key={`${plugin.id}:${panel.id}`} className="grid gap-2 border border-rule bg-ink/25 p-3">
                      <div className="flex items-center gap-2">
                        <Plug size={14} strokeWidth={1.7} className="text-signal" />
                        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
                          {panel.title}
                        </strong>
                      </div>
                      <span className="font-mono text-label text-muted">{plugin.manifest.name}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-copy">
                          {panel.entry}
                        </span>
                        <Button
                          variant="outline"
                          size="compact"
                          type="button"
                          onClick={() => void renderPluginPanel(plugin.id, panel.id)}
                          data-testid={`renderPluginPanel-${plugin.id}-${panel.id}`}
                        >
                          <Play size={12} strokeWidth={1.7} />
                          Render
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                {approvedPlugins.every((plugin) => plugin.manifest.panels.length === 0) && (
                  <EmptyState className="min-h-[130px]">
                    <Plug size={18} strokeWidth={1.4} />
                    <span>No approved plugin panels</span>
                  </EmptyState>
                )}
              </div>
              {pluginPanelRender && (
                <div className="grid gap-2 border border-rule bg-surface/45 p-2" data-testid="pluginPanelRender">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel>{pluginPanelRender.title}</FieldLabel>
                    <StatusBadge tone={pluginPanelRender.ok ? "good" : "danger"}>
                      {pluginPanelRender.runtimeStatus}
                    </StatusBadge>
                  </div>
                  {pluginPanelRender.ok ? (
                    <iframe
                      title={pluginPanelRender.title}
                      sandbox=""
                      srcDoc={pluginPanelRender.html}
                      className="h-[180px] w-full border border-rule bg-ink"
                    />
                  ) : (
                    <pre className="max-h-[180px] overflow-auto text-label text-rust">
                      {pluginPanelRender.error}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 border border-rule bg-ink/25 p-3" data-testid="pluginApiConsole">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rd-eyebrow text-signal">
                    SDK Console
                  </span>
                  <h2 className="mt-1 font-display text-head uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                    Bounded Execution
                  </h2>
                </div>
                <StatusBadge>{pluginApiResult?.action || "idle"}</StatusBadge>
              </div>
              <Textarea
                variant="code"
                className="min-h-[150px]"
                value={pluginApiRequestText}
                onChange={(event) => setPluginApiRequestText(event.target.value)}
                data-testid="pluginApiRequest"
              />
              <Button
                variant="solid"
                type="button"
                onClick={() => void runPluginApiRequest()}
                disabled={!pluginApiRequestText.trim()}
                data-testid="runPluginApi"
              >
                <Terminal size={13} strokeWidth={1.7} />
                Run Action
              </Button>
              {pluginApiResult && (
                <pre className="max-h-[170px] overflow-auto text-label" data-testid="pluginApiResult">
                  {JSON.stringify(pluginApiResult, null, 2)}
                </pre>
              )}
            </div>

            <div className="grid gap-3 border border-rule bg-ink/25 p-3" data-testid="pluginAudit">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rd-eyebrow text-signal">
                    Audit ledger
                  </span>
                  <h2 className="mt-1 font-display text-head uppercase leading-none tracking-data text-bone [font-stretch:75%]">
                    Plugin Calls
                  </h2>
                </div>
                <Button variant="ghost" size="compact" type="button" onClick={() => void refreshPluginAudit()}>
                  <History size={12} strokeWidth={1.7} />
                  Refresh
                </Button>
              </div>
              <div className="grid max-h-[340px] gap-2 overflow-auto">
                {pluginAudit.length === 0 && <EmptyState>No plugin audit entries yet</EmptyState>}
                {pluginAudit.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="grid gap-1 border border-rule bg-surface/40 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={entry.ok ? "good" : "danger"}>{entry.ok ? "ok" : "blocked"}</StatusBadge>
                      <StatusBadge>{entry.action}</StatusBadge>
                      {entry.permission && <StatusBadge tone="ghost">{entry.permission}</StatusBadge>}
                    </div>
                    <strong className="font-display text-body uppercase tracking-data text-bone">
                      {entry.pluginName}
                    </strong>
                    <span className="font-mono text-label text-muted">{entry.createdAt}</span>
                    <span className="line-clamp-2 text-meta leading-5 text-copy">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
