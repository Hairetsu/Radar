import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProxyProfile,
  ProxyProfileId,
  ProxyState,
  SslEvent
} from "../../types";
import type { NoticePort } from "./ports";

const defaultProxyState: ProxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};

export type SslProxyDomain = ReturnType<typeof useSslProxyDomain>;

export function useSslProxyDomain(ports: NoticePort) {
  const [proxyState, setProxyState] = useState<ProxyState>(defaultProxyState);
  const [sslEvents, setSslEvents] = useState<SslEvent[]>([]);
  const [proxyProfiles, setProxyProfiles] = useState<ProxyProfile[]>([]);
  const [selectedProxyProfileId, setSelectedProxyProfileId] = useState<ProxyProfileId>("radar-browser");
  const [proxyProfileNotes, setProxyProfileNotes] = useState("");

  const selectedProxyProfile = useMemo(
    () => proxyProfiles.find((profile) => profile.id === selectedProxyProfileId) || proxyProfiles[0] || null,
    [proxyProfiles, selectedProxyProfileId]
  );

  useEffect(() => {
    setProxyProfileNotes(selectedProxyProfile?.notes || "");
  }, [selectedProxyProfile]);

  const ensureProxyCa = useCallback(async () => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to create the proxy CA.");
      return;
    }
    const state = await window.radar.ensureProxyCa();
    setProxyState(state);
    ports.setNotice("Proxy CA ready");
  }, [ports]);

  const startProxy = useCallback(async () => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to start the proxy.");
      return;
    }
    const state = await window.radar.startProxy(proxyState.port);
    setProxyState(state);
    ports.setNotice(`Proxy listening on ${state.proxyUrl}`);
  }, [proxyState.port, ports]);

  const stopProxy = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    const state = await window.radar.stopProxy();
    setProxyState(state);
    ports.setNotice("Proxy stopped");
  }, [ports]);

  const selectProxyProfile = useCallback((id: ProxyProfileId) => {
    setSelectedProxyProfileId(id);
  }, []);

  const saveProxyProfile = useCallback(async () => {
    if (!window.radar?.saveProxyProfile) {
      ports.setNotice("Run in Electron to save proxy profile notes.");
      return;
    }
    const saved = await window.radar.saveProxyProfile({ id: selectedProxyProfileId, notes: proxyProfileNotes });
    setProxyProfiles(saved);
    ports.setNotice("Proxy profile notes saved");
  }, [proxyProfileNotes, selectedProxyProfileId, ports]);

  return {
    proxyState,
    setProxyState,
    sslEvents,
    setSslEvents,
    proxyProfiles,
    setProxyProfiles,
    selectedProxyProfileId,
    setSelectedProxyProfileId,
    proxyProfileNotes,
    setProxyProfileNotes,
    selectedProxyProfile,
    ensureProxyCa,
    startProxy,
    stopProxy,
    selectProxyProfile,
    saveProxyProfile
  };
}
