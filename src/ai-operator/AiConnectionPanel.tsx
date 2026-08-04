import { Loader2, LogIn, PlugZap, RadioTower } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { FieldLabel, StatusBadge } from "../components/radar/primitives";
import { aiProviderFromValue } from "../lib/aiProvider";
import type { AiOperatorController } from "./useAiOperator";

export function AiConnectionPanel({ controller }: { controller: AiOperatorController }) {
  const settings = controller.settings;
  return (
    <section className="min-h-0 overflow-y-auto p-4 min-[760px]:p-6" data-testid="aiOperatorConnectionPanel">
      <div className="mx-auto grid max-w-3xl gap-4 border border-rule bg-surface/55 p-5 shadow-bureau">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="flex items-center gap-2 rd-eyebrow text-signal"><RadioTower size={13} /> AI Channel</span>
            <h2 className="mt-2 font-display text-hero uppercase tracking-key text-bone">Connection Deck</h2>
            <p className="mt-2 max-w-2xl text-body leading-6 text-muted">Provider credentials stay in Electron user data. The workspace receives only a bounded connection summary.</p>
          </div>
          <div className="flex gap-1"><StatusBadge tone={controller.connection.connected ? "good" : "warn"}>{controller.connection.connected ? "connected" : "offline"}</StatusBadge><StatusBadge>{settings.provider}</StatusBadge></div>
        </header>

        <div className="grid gap-3">
          <FieldLabel className="px-0 pt-0">Quick Connect</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("codex")} data-testid="aiConnectCodex">Codex Connect</Button>
            <Button type="button" variant="outline" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("cursor_cli")} data-testid="aiConnectCursorCli">Cursor CLI Connect</Button>
          </div>

          <FieldLabel className="px-0">Provider And Model</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={settings.provider} onChange={(event) => {
              const provider = aiProviderFromValue(event.target.value);
              if (provider) controller.setSettings({ ...settings, provider });
            }} data-testid="aiProvider">
              <option value="openai">OpenAI</option>
              <option value="codex-local">Codex app</option>
              <option value="cursor-local">Cursor agent</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </Select>
            <Select value={settings.model} onChange={(event) => controller.setSettings({ ...settings, model: event.target.value })} data-testid="aiModel">
              {controller.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              {controller.models.length === 0 && <option value={settings.model}>{settings.model || "No models loaded"}</option>}
            </Select>
          </div>

          {settings.provider === "cursor-local" ? (
            <div className="grid gap-2">
              <Button type="button" variant="outline" disabled={controller.connectionPending} onClick={() => void controller.loginCursor()} data-testid="aiCursorLogin"><LogIn size={13} /> Sign in with Cursor</Button>
              <Input type="password" value={settings.apiKey === "local" ? "" : settings.apiKey} onChange={(event) => controller.setSettings({ ...settings, apiKey: event.target.value.trim() || "local" })} placeholder="Optional API key" data-testid="aiCursorApiKey" />
            </div>
          ) : settings.provider === "codex-local" ? (
            <p className="radar-note border px-3 py-2 font-mono text-label leading-5 text-muted">Uses the installed Codex app login. Radar does not store a separate API key.</p>
          ) : (
            <Input type="password" value={settings.apiKey} onChange={(event) => controller.setSettings({ ...settings, apiKey: event.target.value })} placeholder="API key" data-testid="aiApiKey" />
          )}

          {settings.provider === "openai-compatible" && <Input value={settings.baseUrl} onChange={(event) => controller.setSettings({ ...settings, baseUrl: event.target.value })} placeholder="http://127.0.0.1:11434/v1" data-testid="aiBaseUrl" />}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="solid" disabled={controller.connectionPending} onClick={() => void controller.saveSettings()} data-testid="aiSaveSettings">{controller.connectionPending ? <Loader2 size={13} className="animate-[spin_0.9s_linear_infinite]" /> : <PlugZap size={13} />} Save & Test</Button>
            <Button type="button" variant="outline" disabled={controller.connectionPending} onClick={() => void controller.probeConnection()} data-testid="aiProbeConnection">Test Connection</Button>
          </div>
          <p className="font-mono text-label text-muted" data-testid="aiConnectionStatus">{controller.connection.message}</p>
          {controller.connectionError && <p className="text-body text-rust">{controller.connectionError}</p>}
        </div>
      </div>
    </section>
  );
}

