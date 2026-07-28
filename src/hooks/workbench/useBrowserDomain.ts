import { useCallback, useRef, useState, type FormEvent } from "react";
import type { BrowserState } from "../../types";
import { DEFAULT_URL, normalizeUrl } from "../../lib";

const closedBrowserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};

interface BrowserDomainPorts {
  setNotice: (message: string) => void;
}

export type BrowserDomain = ReturnType<typeof useBrowserDomain>;

export function useBrowserDomain(ports: BrowserDomainPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [address, setAddress] = useState(DEFAULT_URL);
  const [browserState, setBrowserState] = useState<BrowserState>(closedBrowserState);

  const openBrowser = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to open Chrome.");
      return;
    }
    try {
      const state = await window.radar.openBrowser(next);
      setBrowserState(state);
      setAddress(state.url || next);
      portsRef.current.setNotice(
        `${state.channel} launched through Radar proxy · Playwright ${state.automation || "connecting"}`
      );
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Chrome launch failed");
    }
  }, [address]);

  const navigateBrowser = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to control Chrome.");
      return;
    }
    try {
      const state = browserState.open
        ? await window.radar.navigateBrowser(next)
        : await window.radar.openBrowser(next);
      setBrowserState(state);
      setAddress(state.url || next);
      portsRef.current.setNotice(`${state.open ? "Browser at" : "Browser could not reach"} ${state.url || next}`);
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Browser navigation failed");
    }
  }, [address, browserState.open]);

  const browserBack = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    try {
      const state = await window.radar.browserBack();
      setBrowserState(state);
      setAddress(state.url || address);
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Browser back failed");
    }
  }, [address]);

  const browserForward = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    try {
      const state = await window.radar.browserForward();
      setBrowserState(state);
      setAddress(state.url || address);
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Browser forward failed");
    }
  }, [address]);

  const browserReload = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    try {
      const state = await window.radar.browserReload();
      setBrowserState(state);
      setAddress(state.url || address);
      portsRef.current.setNotice(`Reloaded ${state.url || address}`);
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Browser reload failed");
    }
  }, [address]);

  const prepareAiNavigate = useCallback((url: string) => {
    setAddress(normalizeUrl(url));
  }, []);

  return {
    address,
    setAddress,
    browserState,
    setBrowserState,
    openBrowser,
    navigateBrowser,
    browserBack,
    browserForward,
    browserReload,
    prepareAiNavigate
  };
}
