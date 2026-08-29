import { useEffect } from "react";
import {
  Braces,
  Code2,
  Copy,
  FileCode2,
  Repeat2,
  Target,
  Terminal,
  Trash2
} from "lucide-react";
import { isOverridableClientCapture } from "../../../shared/clientOverrides";
import {
  cn,
  REQUEST_EXPORT_LABELS,
  requestExportFormats,
  testIdSuffix,
  type RequestExportFormat
} from "../../lib";
import type { CapturedRequest } from "../../types";
import { requestMenuActionClass, requestMenuDangerClass } from "./layoutClasses";

export type RequestMenuState = {
  x: number;
  y: number;
  captureId: string;
};

export type RequestContextMenuProps = {
  requestMenu: RequestMenuState | null;
  requestMenuCapture: CapturedRequest | null;
  requestMenuOriginInScope: boolean;
  onClose: () => void;
  onCopyExport: (format: RequestExportFormat) => void | Promise<void>;
  onCopyUrl: () => void | Promise<void>;
  onCloneToRepeater: () => void;
  onCloneToClientOverride: () => void;
  onAddToScope: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export function RequestContextMenu({
  requestMenu,
  requestMenuCapture,
  requestMenuOriginInScope,
  onClose,
  onCopyExport,
  onCopyUrl,
  onCloneToRepeater,
  onCloneToClientOverride,
  onAddToScope,
  onDelete
}: RequestContextMenuProps) {
  useEffect(() => {
    if (!requestMenu) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const close = () => onClose();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [requestMenu, onClose]);

  useEffect(() => {
    if (requestMenu && !requestMenuCapture) {
      onClose();
    }
  }, [requestMenu, requestMenuCapture, onClose]);

  if (!requestMenu || !requestMenuCapture) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-testid="requestContextMenuOverlay"
      data-component="requestContextMenuOverlay"
    >
      <div
        role="menu"
        aria-label="Request actions"
        className="absolute w-[264px] overflow-hidden border border-rule theme-modal-surface shadow-bureau backdrop-blur-xl"
        style={{ left: requestMenu.x, top: requestMenu.y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        data-testid="requestContextMenu"
        data-component="requestContextMenu"
      >
        <div className="border-b border-rule bg-signal/5 px-3 py-2">
          <span className="block rd-eyebrow text-signal">
            Request
          </span>
          <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta uppercase tracking-data text-bone">
            {requestMenuCapture.method} {requestMenuCapture.host || "capture"}
          </strong>
          <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
            {requestMenuCapture.path || requestMenuCapture.url}
          </span>
        </div>

        <div className="py-1">
          {requestExportFormats.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              className={requestMenuActionClass}
              onClick={() => void onCopyExport(format)}
              data-testid={`requestMenuCopy${testIdSuffix(format)}`}
              data-component="requestMenuCopyExport"
            >
              {format === "curl" || format === "bash" ? (
                <Terminal size={13} strokeWidth={1.7} />
              ) : format === "python" ? (
                <FileCode2 size={13} strokeWidth={1.7} />
              ) : format === "fetch" ? (
                <Code2 size={13} strokeWidth={1.7} />
              ) : (
                <Braces size={13} strokeWidth={1.7} />
              )}
              Copy as {REQUEST_EXPORT_LABELS[format]}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className={requestMenuActionClass}
            onClick={() => void onCopyUrl()}
            data-testid="requestMenuCopyUrl"
            data-component="requestMenuCopyUrl"
          >
            <Copy size={13} strokeWidth={1.7} />
            Copy URL
          </button>
        </div>

        <div className="border-t border-rule py-1">
          <button
            type="button"
            role="menuitem"
            className={requestMenuActionClass}
            onClick={onCloneToRepeater}
            data-testid="requestMenuToRepeater"
            data-component="requestMenuToRepeater"
          >
            <Repeat2 size={13} strokeWidth={1.7} />
            To Repeater
          </button>
          <button
            type="button"
            role="menuitem"
            className={requestMenuActionClass}
            onClick={onCloneToClientOverride}
            disabled={!isOverridableClientCapture(requestMenuCapture)}
            data-testid="requestMenuToClientOverride"
            data-component="requestMenuToClientOverride"
          >
            <FileCode2 size={13} strokeWidth={1.7} />
            Override Client File
          </button>
          <button
            type="button"
            role="menuitem"
            className={requestMenuActionClass}
            onClick={() => void onAddToScope()}
            disabled={requestMenuOriginInScope}
            data-testid="requestMenuAddScope"
            data-component="requestMenuAddScope"
          >
            <Target size={13} strokeWidth={1.7} />
            {requestMenuOriginInScope ? "Origin In Scope" : "Add Origin To Scope"}
          </button>
        </div>

        <div className="border-t border-rule py-1">
          <button
            type="button"
            role="menuitem"
            className={cn(requestMenuActionClass, requestMenuDangerClass)}
            onClick={() => void onDelete()}
            data-testid="requestMenuDelete"
            data-component="requestMenuDelete"
          >
            <Trash2 size={13} strokeWidth={1.7} />
            Delete Capture
          </button>
        </div>
      </div>
    </div>
  );
}
