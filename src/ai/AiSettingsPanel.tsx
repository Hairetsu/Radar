import { Loader2, PlugZap, Settings2, X } from "lucide-react";
import { useEffect } from "react";
import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { aiProviderFromValue } from "../lib/aiProvider";
import { cn } from "../lib/utils";
import type { AiConnectPresetId, AiSettings } from "./types";

type AiSettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  onSettingsChange: (settings: AiSettings) => void;
  models: Array<{ id: string; label: string }>;
  modelsLoading: boolean;
  connected: boolean;
  checking: boolean;
  message: string;
  error: string;
  onSave: () => void;
  onProbe: () => void;
  onConnectPreset: (presetId: AiConnectPresetId) => void;
  onCursorLogin: () => void;
  saving: boolean;
  probing: boolean;
  connecting: boolean;
  cursorLoggingIn: boolean;
};

export function AiSettingsPanel({
  open,
  onClose,
  settings,
  onSettingsChange,
  models,
  modelsLoading,
  connected,
  checking,
  message,
  error,
  onSave,
  onProbe,
  onConnectPreset,
  onCursorLogin,
  saving,
  probing,
  connecting,
  cursorLoggingIn
}: AiSettingsPanelProps) {
  const pending = saving || probing || connecting || cursorLoggingIn;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="aiSettingsBackdrop"
      data-component="aiSettingsBackdrop"
    >
      <div
        className="theme-modal-surface grid w-full max-w-xl gap-4 border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        data-testid="aiSettingsPanel"
        data-component="aiSettingsPanel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal">
              <Settings2 size={12} strokeWidth={1.8} /> AI Channel
            </span>
            <h3 className="font-display text-[28px] uppercase tracking-[0.08em] text-bone">Connection</h3>
            <p
              className={cn(
                "mt-1 text-[10px] uppercase tracking-[0.24em]",
                connected ? "text-jade" : checking ? "text-sand" : "text-muted"
              )}
              data-testid="aiConnectionStatus"
              data-component="aiConnectionStatus"
            >
              {checking ? "Checking connection…" : connected ? "Connected" : "Not connected"} · {message}
            </p>
          </div>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={onClose}
            title="Close"
            data-testid="aiSettingsClose"
            data-component="aiSettingsClose"
          >
            <X size={16} strokeWidth={1.8} />
          </Button>
        </header>

        <section className="grid gap-3">
          <FieldLabel className="px-0 pt-0">Presets</FieldLabel>
          <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onConnectPreset("codex")}
              data-testid="aiConnectCodex"
              data-component="aiConnectButton"
            >
              Codex Connect
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onConnectPreset("cursor_cli")}
              data-testid="aiConnectCursorCli"
              data-component="aiConnectButton"
            >
              Cursor CLI Connect
            </Button>
          </div>

          <FieldLabel className="px-0">Provider</FieldLabel>
          <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
            <Select
              variant="compact"
              value={settings.provider}
              onChange={(event) => {
                const provider = aiProviderFromValue(event.target.value);
                if (provider) {
                  onSettingsChange({ ...settings, provider });
                }
              }}
              data-testid="aiProvider"
              data-component="aiProvider"
            >
              <option value="openai">OpenAI</option>
              <option value="codex-local">Codex app</option>
              <option value="cursor-local">Cursor agent</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </Select>
            <Select
              variant="compact"
              value={settings.model}
              disabled={modelsLoading}
              onChange={(event) => onSettingsChange({ ...settings, model: event.target.value })}
              data-testid="aiModel"
              data-component="aiModel"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
              {models.length === 0 && !settings.model && <option value="">No models</option>}
            </Select>
          </div>

          {settings.provider === "cursor-local" ? (
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onCursorLogin}
                data-testid="aiCursorLogin"
                data-component="aiCursorLogin"
              >
                {cursorLoggingIn ? (
                  <Loader2 size={14} className="animate-[spin_0.9s_linear_infinite]" />
                ) : null}
                Sign in with Cursor
              </Button>
              <p
                className="radar-note border px-3 py-2 font-mono text-[9px] uppercase leading-[1.6] tracking-[0.2em]"
                data-testid="aiLocalCursorNote"
                data-component="aiLocalCursorNote"
              >
                Opens your browser to link the same Cursor account as the CLI. No API key is stored unless you add one
                below for headless use.
              </p>
              <Input
                variant="compact"
                className="uppercase tracking-[0.12em]"
                type="password"
                value={settings.apiKey === "local" ? "" : settings.apiKey}
                onChange={(event) =>
                  onSettingsChange({ ...settings, apiKey: event.target.value.trim() || "local" })
                }
                placeholder="Optional API key"
                spellCheck={false}
                data-testid="aiCursorApiKey"
                data-component="aiCursorApiKey"
              />
            </div>
          ) : settings.provider === "codex-local" ? (
            <p
              className="radar-note border px-3 py-2 font-mono text-[9px] uppercase leading-[1.6] tracking-[0.2em]"
              data-testid="aiLocalCodexNote"
              data-component="aiLocalCodexNote"
            >
              Uses your installed Codex app login; no API key is stored in Radar.
            </p>
          ) : (
            <Input
              variant="compact"
              className="uppercase tracking-[0.12em]"
              type="password"
              value={settings.apiKey}
              onChange={(event) => onSettingsChange({ ...settings, apiKey: event.target.value })}
              placeholder="API key"
              spellCheck={false}
              data-testid="aiApiKey"
              data-component="aiApiKey"
            />
          )}

          {settings.provider === "openai-compatible" && (
            <Input
              variant="compact"
              className="uppercase tracking-[0.12em]"
              value={settings.baseUrl}
              onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.target.value })}
              spellCheck={false}
              placeholder="http://127.0.0.1:11434/v1"
              data-testid="aiBaseUrl"
              data-component="aiBaseUrl"
            />
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="solid"
              disabled={pending}
              onClick={onSave}
              data-testid="aiSaveSettings"
              data-component="aiSaveSettings"
            >
              {saving ? <Loader2 size={14} className="animate-[spin_0.9s_linear_infinite]" /> : <PlugZap size={14} />}
              Save & test
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onProbe}
              data-testid="aiProbeConnection"
              data-component="aiProbeConnection"
            >
              {probing ? <Loader2 size={14} className="animate-[spin_0.9s_linear_infinite]" /> : null}
              Test connection
            </Button>
          </div>

          {error && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-rust">{error}</p>}
        </section>
      </div>
    </div>
  );
}
