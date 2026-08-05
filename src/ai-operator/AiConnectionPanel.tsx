import { Braces, KeyRound, Loader2, LogIn, PlugZap, RadioTower, SquareTerminal } from "lucide-react";
import { AI_PROVIDER_PROFILES, selectAiProvider } from "../../shared/ai-providers";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { FieldLabel, StatusBadge } from "../components/radar/primitives";
import { aiProviderFromValue } from "../lib/aiProvider";
import type { AiOperatorController } from "./useAiOperator";

export function AiConnectionPanel({ controller }: { controller: AiOperatorController }) {
  const settings = controller.settings;
  const profile = AI_PROVIDER_PROFILES[settings.provider];
  const selectedModelIsLoaded = controller.models.some((model) => model.id === settings.model);
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
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("codex")} data-testid="aiConnectCodex"><SquareTerminal size={13} /> Codex app</Button>
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("openai")} data-testid="aiConnectOpenAi"><KeyRound size={13} /> OpenAI key</Button>
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("anthropic")} data-testid="aiConnectAnthropic"><KeyRound size={13} /> Anthropic key</Button>
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("xai")} data-testid="aiConnectXai"><KeyRound size={13} /> xAI / Grok key</Button>
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("openrouter")} data-testid="aiConnectOpenRouter"><Braces size={13} /> OpenRouter key</Button>
            <Button type="button" variant="outline" className="justify-start" disabled={controller.connectionPending} onClick={() => void controller.connectPreset("cursor_cli")} data-testid="aiConnectCursorCli"><SquareTerminal size={13} /> Cursor CLI</Button>
          </div>

          <FieldLabel className="px-0">Provider And Model</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={settings.provider} onChange={(event) => {
              const provider = aiProviderFromValue(event.target.value);
              if (provider) controller.setSettings(selectAiProvider(settings, provider));
            }} data-testid="aiProvider">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="xai">xAI / Grok</option>
              <option value="openrouter">OpenRouter</option>
              <option value="codex-local">Codex app</option>
              <option value="cursor-local">Cursor agent</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </Select>
            <Select value={settings.model} onChange={(event) => controller.setSettings({ ...settings, model: event.target.value })} data-testid="aiModel">
              {!selectedModelIsLoaded && <option value={settings.model}>{settings.model || "No models loaded"}</option>}
              {controller.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
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
            <div className="grid gap-2">
              <Input type="password" value={settings.apiKey} onChange={(event) => controller.setSettings({ ...settings, apiKey: event.target.value })} placeholder={profile.apiKeyPlaceholder} autoComplete="off" spellCheck={false} data-testid="aiApiKey" />
              <p className="font-mono text-micro leading-5 text-muted">
                {profile.environmentKey ? profile.environmentKey + " is checked by Quick Connect. " : ""}
                Pasted keys stay in Radar's Electron user data and are never exposed to the inspected page.
              </p>
            </div>
          )}

          {settings.provider === "openai-compatible" && <Input value={settings.baseUrl} onChange={(event) => controller.setSettings({ ...settings, baseUrl: event.target.value })} placeholder="http://127.0.0.1:11434/v1" data-testid="aiBaseUrl" />}
          {settings.provider !== "codex-local" && settings.provider !== "cursor-local" && settings.provider !== "openai-compatible" && (
            <p className="radar-note border px-3 py-2 font-mono text-micro leading-5 text-muted" data-testid="aiProviderEndpoint">{profile.label} · {profile.baseUrl}</p>
          )}

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
