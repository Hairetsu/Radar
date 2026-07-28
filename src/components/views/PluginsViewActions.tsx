import { Plug, Search } from "lucide-react";
import type { PluginsDomain } from "../../hooks/workbench/usePluginsDomain";
import { Button } from "../ui/button";

export type PluginsViewActionsProps = Pick<
  PluginsDomain,
  "previewPluginInstall" | "installPlugin" | "pluginInstallPath"
>;

export function PluginsViewActions({
  previewPluginInstall,
  installPlugin,
  pluginInstallPath
}: PluginsViewActionsProps) {
  return (
    <>
      <Button
        variant="outline"
        type="button"
        onClick={() => void previewPluginInstall()}
        disabled={!pluginInstallPath.trim()}
        data-testid="previewPluginHeader"
      >
        <Search size={14} strokeWidth={1.7} />
        Preview
      </Button>
      <Button
        variant="solid"
        type="button"
        onClick={() => void installPlugin()}
        disabled={!pluginInstallPath.trim()}
        data-testid="installPluginHeader"
      >
        <Plug size={14} strokeWidth={1.7} />
        Install
      </Button>
    </>
  );
}
