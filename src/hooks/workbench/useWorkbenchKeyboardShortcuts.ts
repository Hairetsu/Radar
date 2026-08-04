import { useEffect, useRef, type RefObject } from "react";
import type { WorkView } from "./viewMeta";

interface WorkbenchKeyboardShortcutPorts {
  activeView: WorkView;
  globalSearchOpen: boolean;
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
  toggleAiPalette: () => void;
  trafficSearchInputRef: RefObject<HTMLInputElement | null>;
  trafficSearch: string;
  webSocketSearch: string;
  trafficMethodFilter: string;
  trafficTypeFilter: string;
  clearTrafficSearch: () => void;
  clearWebSocketSearch: () => void;
  clearTrafficMethodFilter: () => void;
  clearTrafficTypeFilter: () => void;
}

export function useWorkbenchKeyboardShortcuts(ports: WorkbenchKeyboardShortcutPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = portsRef.current;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        void window.radar?.openAiOperator("runs");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        current.toggleAiPalette();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        current.openGlobalSearch();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (
          current.activeView !== "traffic" &&
          current.activeView !== "websocket" &&
          current.activeView !== "sitemap"
        ) {
          return;
        }
        event.preventDefault();
        current.trafficSearchInputRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") {
        return;
      }
      if (current.globalSearchOpen) {
        current.closeGlobalSearch();
        return;
      }
      if (
        current.trafficSearch.trim() ||
        current.webSocketSearch.trim() ||
        current.trafficMethodFilter !== "all" ||
        current.trafficTypeFilter !== "all"
      ) {
        current.clearTrafficSearch();
        current.clearWebSocketSearch();
        current.clearTrafficMethodFilter();
        current.clearTrafficTypeFilter();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
