import { useState, type MouseEvent } from "react";
import {
  contextMenuPosition,
  formatCapturedRequest,
  originFromUrl,
  REQUEST_EXPORT_LABELS,
  type RequestExportFormat
} from "../lib";
import type { RequestMenuState } from "../components/shell/RequestContextMenu";
import type { RadarWorkbench } from "./useRadarWorkbench";
import type { CapturedRequest } from "../types";

export function useRequestContextMenu(workbench: RadarWorkbench) {
  const [requestMenu, setRequestMenu] = useState<RequestMenuState | null>(null);
  const capture = requestMenu
    ? workbench.captures.find((item) => item.id === requestMenu.captureId) || null
    : null;
  const origin = capture ? originFromUrl(capture.url) : "";
  const originInScope = Boolean(origin && workbench.targets.includes(origin));

  const open = (
    event: MouseEvent<HTMLElement>,
    selectedCapture: CapturedRequest | null = workbench.selected
  ) => {
    if (!selectedCapture) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    workbench.selectTrafficCapture(selectedCapture.id);
    setRequestMenu({
      ...contextMenuPosition(event),
      captureId: selectedCapture.id
    });
  };

  const copyExport = async (format: RequestExportFormat) => {
    if (!capture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(formatCapturedRequest(capture, format));
      workbench.setNotice(`Request copied as ${REQUEST_EXPORT_LABELS[format]}`);
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };

  const copyUrl = async () => {
    if (!capture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(capture.url);
      workbench.setNotice("Request URL copied");
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };

  const cloneToRepeater = () => {
    if (capture) {
      workbench.cloneToRepeater(capture);
    }
    setRequestMenu(null);
  };

  const cloneToClientOverride = () => {
    if (capture) {
      workbench.cloneToClientOverride(capture);
    }
    setRequestMenu(null);
  };

  const addToScope = async () => {
    if (capture) {
      await workbench.addTarget(capture.url);
    }
    setRequestMenu(null);
  };

  const deleteRequest = async () => {
    if (capture) {
      await workbench.deleteCapture(capture.id);
    }
    setRequestMenu(null);
  };

  return {
    open,
    menuProps: {
      requestMenu,
      requestMenuCapture: capture,
      requestMenuOriginInScope: originInScope,
      onClose: () => setRequestMenu(null),
      onCopyExport: copyExport,
      onCopyUrl: copyUrl,
      onCloneToRepeater: cloneToRepeater,
      onCloneToClientOverride: cloneToClientOverride,
      onAddToScope: addToScope,
      onDelete: deleteRequest
    }
  };
}
