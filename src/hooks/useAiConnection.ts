import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiConnectPresetId, AiModelOption, AiSettings } from "../ai/types";
import { DEFAULT_AI_SETTINGS } from "../ai/types";
import { useAsyncAction } from "./useAsyncAction";

function canRunWithSettings(settings: AiSettings) {
  return settings.provider === "codex-local" || settings.provider === "cursor-local" || Boolean(settings.apiKey.trim());
}

export function useAiConnection() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [settingsOpen, setSettingsOpenState] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("Not connected");
  const [error, setError] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const applyProbe = useCallback((ok: boolean, nextMessage: string) => {
    setConnected(ok);
    setMessage(nextMessage);
  }, []);

  const probeWithSettings = useCallback(async (nextSettings: AiSettings) => {
    if (!window.radar) {
      applyProbe(false, "Run in Electron for AI");
      return;
    }
    if (!canRunWithSettings(nextSettings)) {
      applyProbe(false, "Add an API key or connect a preset");
      return;
    }

    setChecking(true);
    setError("");
    try {
      const probe = await window.radar.probeAiConnection(nextSettings);
      applyProbe(probe.ok, probe.message);
      if (!probe.ok) {
        setError(probe.message);
      }
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Connection check failed";
      applyProbe(false, nextError);
      setError(nextError);
    } finally {
      setChecking(false);
    }
  }, [applyProbe]);

  const probeAction = useCallback(async () => {
    await probeWithSettings(settings);
  }, [probeWithSettings, settings]);

  const loadSettings = useCallback(async () => {
    if (!window.radar) {
      return DEFAULT_AI_SETTINGS;
    }
    const next = await window.radar.getAiSettings();
    setSettings(next);
    return next;
  }, []);

  const refreshModels = useCallback(async (nextSettings: AiSettings) => {
    if (!window.radar) {
      return;
    }

    setModelsLoading(true);
    try {
      const cached = await window.radar.getAiModels(nextSettings.provider);
      if (cached.length > 0) {
        setModels(cached);
      }

      const next = await window.radar.refreshAiModels(nextSettings);
      setModels(next);
      const saved = await window.radar.getAiSettings();
      setSettings(saved);
    } catch {
      // keep cached models when refresh fails
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const saveSettingsAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to save AI settings.");
      return;
    }
    setError("");
    const saved = await window.radar.setAiSettings(settings);
    setSettings(saved);
    await probeWithSettings(saved);
    await refreshModels(saved);
    return saved;
  }, [probeWithSettings, refreshModels, settings]);

  const connectPresetAction = useCallback(
    async (presetId: AiConnectPresetId) => {
      if (!window.radar) {
        setError("Run in Electron to connect.");
        return;
      }
      try {
        setError("");
        const next = await window.radar.connectAi(presetId);
        setSettings(next.settings);
        await refreshModels(next.settings);
        const source =
          next.meta.apiKeySource === "missing"
            ? " — add API key or env var"
            : next.meta.presetId === "codex" && next.meta.apiKeySource === "local"
              ? " · installed Codex auth"
              : ` · key from ${next.meta.apiKeySource}`;
        const note = `${next.meta.label}: ${next.probe.message}${source}`;
        applyProbe(next.probe.ok, note);
        if (!next.probe.ok) {
          setError(next.probe.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connect failed");
        applyProbe(false, "Connect failed");
      }
    },
    [applyProbe, refreshModels]
  );

  const probeMutation = useAsyncAction(probeAction);
  const saveMutation = useAsyncAction(saveSettingsAction);
  const connectMutation = useAsyncAction(connectPresetAction);

  const loginCursorAction = useCallback(async () => {
    if (!window.radar) {
      setError("Run in Electron to sign in.");
      return;
    }
    try {
      setError("");
      const probe = await window.radar.loginCursor();
      applyProbe(probe.ok, probe.message);
      if (!probe.ok) {
        setError(probe.message);
        return;
      }
      if (settings.provider === "cursor-local") {
        await refreshModels(settings);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cursor sign-in failed";
      applyProbe(false, message);
      setError(message);
    }
  }, [applyProbe, refreshModels, settings]);

  const loginCursorMutation = useAsyncAction(loginCursorAction);

  const setSettingsOpen = useCallback((open: boolean) => {
    setSettingsOpenState(open);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await loadSettings();
      if (!cancelled) {
        await probeWithSettings(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings, probeWithSettings]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }
    void refreshModels(settingsRef.current);
  }, [refreshModels, settings.provider, settingsOpen]);

  const canRun = useMemo(() => canRunWithSettings(settings) && connected, [connected, settings]);
  const statusLabel = checking ? "checking" : connected ? "live" : "off";

  return {
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    models,
    modelsLoading,
    connected,
    checking,
    message,
    error,
    canRun,
    statusLabel,
    probe: probeMutation.run,
    saveSettings: saveMutation.run,
    connectPreset: connectMutation.run,
    loginCursor: loginCursorMutation.run,
    probing: probeMutation.isPending,
    saving: saveMutation.isPending,
    connecting: connectMutation.isPending,
    cursorLoggingIn: loginCursorMutation.isPending
  };
}
