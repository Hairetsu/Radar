import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Braces, Copy, Eraser, FileText, Repeat2, Search, Square } from "lucide-react";
import type { FindingsDomain } from "../../hooks/workbench/useFindingsDomain";
import type { WebSocketDomain } from "../../hooks/workbench/useWebSocketDomain";
import type { WorkbenchShellDomain } from "../../hooks/workbench/useWorkbenchShell";
import {
  cn,
  formatBytes,
  websocketDetailText,
  websocketDirectionTone,
  websocketFrameKind,
  websocketPayloadPreview
} from "../../lib";
import type { EvidenceAnnotation, FindingTemplateId, WebSocketDirection } from "../../types";
import { EmptyState, StatusBadge } from "../radar/primitives";
import { detailTabClass, detailTabRowClass, ellipsisMono, websocketRowClass } from "../shell/layoutClasses";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

export type WebSocketViewActionsProps = Pick<WebSocketDomain, "clearWebSocketEvents"> & {
  onClearSelection: () => void;
};

export function WebSocketViewActions({ clearWebSocketEvents, onClearSelection }: WebSocketViewActionsProps) {
  return (
    <Button
      variant="icon"
      size="icon"
      onClick={() => {
        void clearWebSocketEvents();
        onClearSelection();
      }}
      title="Clear WebSocket frames"
      data-testid="clearWebSocketEvents"
      data-component="clearWebSocketEvents"
    >
      <Eraser size={15} strokeWidth={1.7} />
    </Button>
  );
}

export type WebSocketViewProps = Pick<
  WebSocketDomain,
  | "webSocketEvents"
  | "filteredWebSocketEvents"
  | "webSocketSearch"
  | "setWebSocketSearch"
  | "webSocketQueryError"
  | "loadWebSocketFrameToRepeater"
> & {
  createFindingFromWebSocket: FindingsDomain["createFindingFromWebSocket"];
  saveEvidenceAnnotation: (annotation: EvidenceAnnotation) => Promise<void>;
  getEvidenceAnnotation: (evidenceId: string, kind: EvidenceAnnotation["kind"]) => EvidenceAnnotation;
  setNotice: WorkbenchShellDomain["setNotice"];
  findingTemplateId: FindingTemplateId;
  selectedWebSocketId: string;
  setSelectedWebSocketId: (id: string) => void;
  selectedWebSocketIds: string[];
  setSelectedWebSocketIds: Dispatch<SetStateAction<string[]>>;
  selectionAnchorRef?: MutableRefObject<string>;
};

export function WebSocketView({
  webSocketEvents,
  filteredWebSocketEvents: workbenchFilteredWebSocketEvents,
  webSocketSearch,
  setWebSocketSearch,
  webSocketQueryError,
  loadWebSocketFrameToRepeater,
  createFindingFromWebSocket,
  saveEvidenceAnnotation,
  getEvidenceAnnotation,
  setNotice,
  findingTemplateId,
  selectedWebSocketId,
  setSelectedWebSocketId,
  selectedWebSocketIds,
  setSelectedWebSocketIds,
  selectionAnchorRef: externalSelectionAnchorRef
}: WebSocketViewProps) {
  const internalSelectionAnchorRef = useRef("");
  const webSocketSelectionAnchorRef = externalSelectionAnchorRef ?? internalSelectionAnchorRef;

  const [webSocketDirectionFilter, setWebSocketDirectionFilter] = useState<WebSocketDirection | "all">("all");
  const [webSocketAnnotationTags, setWebSocketAnnotationTags] = useState("");
  const [webSocketAnnotationComment, setWebSocketAnnotationComment] = useState("");

  const filteredWebSocketEvents = useMemo(() => {
    return workbenchFilteredWebSocketEvents.filter((event) => {
      return webSocketDirectionFilter === "all" || event.direction === webSocketDirectionFilter;
    });
  }, [webSocketDirectionFilter, workbenchFilteredWebSocketEvents]);

  const selectedWebSocketEvent =
    filteredWebSocketEvents.find((event) => event.id === selectedWebSocketId) || filteredWebSocketEvents[0] || null;
  const selectedWebSocketEventId = selectedWebSocketEvent?.id || "";
  const selectedWebSocketDetail = websocketDetailText(selectedWebSocketEvent);

  const webSocketConnectionCount = new Set(webSocketEvents.map((event) => event.requestId)).size;
  const webSocketSentCount = webSocketEvents.filter((event) => event.direction === "sent").length;
  const webSocketReceivedCount = webSocketEvents.filter((event) => event.direction === "received").length;
  const webSocketErrorCount = webSocketEvents.filter((event) => event.direction === "error").length;
  const webSocketPayloadBytes = webSocketEvents.reduce((total, event) => total + event.size, 0);

  const copySelectedWebSocketDetail = async () => {
    if (!selectedWebSocketDetail) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(selectedWebSocketDetail);
      setNotice("WebSocket frame copied");
    } catch {
      setNotice("Copy failed");
    }
  };

  const selectWebSocketEvent = (eventId: string, event?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
    const meta = Boolean(event?.metaKey || event?.ctrlKey);
    const shift = Boolean(event?.shiftKey);

    setSelectedWebSocketId(eventId);
    setSelectedWebSocketIds((current) => {
      if (shift && webSocketSelectionAnchorRef.current) {
        const ids = filteredWebSocketEvents.map((item) => item.id);
        const start = ids.indexOf(webSocketSelectionAnchorRef.current);
        const end = ids.indexOf(eventId);
        if (start === -1 || end === -1) {
          if (meta) {
            return current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId];
          }
          webSocketSelectionAnchorRef.current = eventId;
          return [eventId];
        }
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        const range = ids.slice(from, to + 1);
        return meta ? [...new Set([...current, ...range])] : range;
      }
      if (meta) {
        return current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId];
      }
      webSocketSelectionAnchorRef.current = eventId;
      return [eventId];
    });
  };

  useEffect(() => {
    if (!selectedWebSocketEventId) {
      setWebSocketAnnotationTags("");
      setWebSocketAnnotationComment("");
      return;
    }
    const annotation = getEvidenceAnnotation(selectedWebSocketEventId, "websocket");
    setWebSocketAnnotationTags(annotation.tags.join(", "));
    setWebSocketAnnotationComment(annotation.comment);
  }, [getEvidenceAnnotation, selectedWebSocketEventId]);

  useEffect(() => {
    setSelectedWebSocketIds((current) => {
      const visible = new Set(filteredWebSocketEvents.map((event) => event.id));
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredWebSocketEvents, setSelectedWebSocketIds]);

  useEffect(() => {
    if (webSocketEvents.length === 0) {
      webSocketSelectionAnchorRef.current = "";
    }
  }, [webSocketEvents.length, webSocketSelectionAnchorRef]);

  return (
    <div className="grid min-h-0 [grid-template-columns:minmax(0,1fr)_minmax(420px,0.78fr)] max-[1180px]:grid-cols-1">
      <div className="grid min-h-0 border-r border-rule [grid-template-rows:auto_auto_minmax(0,1fr)] max-[1180px]:border-r-0 max-[1180px]:border-b">
        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(5,minmax(0,1fr))] max-[900px]:grid-cols-2">
          {[
            ["Connections", webSocketConnectionCount],
            ["Frames", webSocketEvents.length],
            ["Outbound", webSocketSentCount],
            ["Inbound", webSocketReceivedCount],
            ["Payload", formatBytes(webSocketPayloadBytes)]
          ].map(([label, value]) => (
            <div key={label} className="radar-card-gradient px-4 py-3">
              <span className="block rd-eyebrow text-muted">{label}</span>
              <strong className="mt-1 block font-display text-head font-semibold uppercase leading-none text-bone [font-stretch:75%]">
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="grid items-center gap-2 border-b border-rule radar-form-gradient px-3 py-2.5 [grid-template-columns:148px_minmax(180px,1fr)_auto] max-[900px]:grid-cols-1">
          <Select
            variant="compact"
            value={webSocketDirectionFilter}
            onChange={(event) => setWebSocketDirectionFilter(event.target.value as WebSocketDirection | "all")}
            aria-label="WebSocket direction filter"
            data-testid="webSocketDirectionFilter"
            data-component="webSocketDirectionFilter"
          >
            <option value="all">All frames</option>
            <option value="handshake">Handshake</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
            <option value="closed">Closed</option>
          </Select>
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
              size={13}
              strokeWidth={1.8}
            />
            <Input
              variant="compact"
              className="w-full pl-8"
              value={webSocketSearch}
              onChange={(event) => setWebSocketSearch(event.target.value)}
              placeholder="Query: direction:sent payload:ping"
              spellCheck={false}
              aria-label="WebSocket query"
              data-testid="webSocketSearch"
              data-component="webSocketSearch"
            />
          </div>
          {webSocketQueryError && (
            <span className="font-mono text-label text-bad">{webSocketQueryError}</span>
          )}
          <Button
            variant="icon"
            size="icon"
            disabled={!webSocketSearch && webSocketDirectionFilter === "all"}
            onClick={() => {
              setWebSocketSearch("");
              setWebSocketDirectionFilter("all");
            }}
            title="Clear WebSocket filters"
            data-testid="clearWebSocketFilters"
            data-component="clearWebSocketFilters"
          >
            <Eraser size={15} strokeWidth={1.7} />
          </Button>
        </div>

        <div className="min-h-0 overflow-auto radar-traffic-list">
          {filteredWebSocketEvents.length === 0 && (
            <EmptyState>
              <Braces size={18} strokeWidth={1.4} />
              <span>
                {webSocketEvents.length === 0
                  ? "No WebSocket frames intercepted"
                  : "No WebSocket frames match filters"}
              </span>
            </EmptyState>
          )}
          {filteredWebSocketEvents.map((event) => {
            const rowSelected = selectedWebSocketIds.includes(event.id);
            const focused = event.id === selectedWebSocketEvent?.id;
            return (
              <Button
                key={event.id}
                variant="ghost"
                className={websocketRowClass(rowSelected, focused)}
                data-selected={rowSelected ? "true" : "false"}
                onClick={(clickEvent) => selectWebSocketEvent(event.id, clickEvent)}
                data-testid={`webSocketRow-${event.id}`}
                data-component="webSocketRow"
              >
                <StatusBadge tone={websocketDirectionTone(event.direction)}>{event.direction}</StatusBadge>
                <span className={cn(ellipsisMono, "font-medium text-bone")}>{event.host || "socket"}</span>
                <span className={ellipsisMono}>{websocketPayloadPreview(event)}</span>
                <span className={ellipsisMono}>{websocketFrameKind(event)}</span>
                <span className={ellipsisMono}>{formatBytes(event.size)}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col radar-detail-pane">
        <div className={detailTabRowClass}>
          <span className="inline-flex h-[38px] items-center gap-2 border-0 border-r border-rule bg-signal/10 px-3 font-mono text-label font-medium uppercase tracking-label text-signal">
            <Square size={9} strokeWidth={2} />
            Frame
          </span>
          <Button
            variant="ghost"
            className={detailTabClass(false)}
            onClick={() => void copySelectedWebSocketDetail()}
            disabled={!selectedWebSocketDetail}
            title="Copy WebSocket frame"
            data-testid="copyWebSocketDetail"
            data-component="copyWebSocketDetail"
          >
            <Copy size={13} strokeWidth={1.7} />
            Copy
          </Button>
          <Button
            variant="ghost"
            className={detailTabClass(false)}
            onClick={() => selectedWebSocketEvent && loadWebSocketFrameToRepeater(selectedWebSocketEvent)}
            disabled={!selectedWebSocketEvent}
            title="Load frame in repeater"
            data-testid="replayWebSocketFrame"
          >
            <Repeat2 size={13} strokeWidth={1.7} />
            Replay
          </Button>
          <Button
            variant="ghost"
            className={detailTabClass(false)}
            onClick={() => void createFindingFromWebSocket(selectedWebSocketEvent, findingTemplateId)}
            disabled={!selectedWebSocketEvent}
            title="Create draft finding from selected WebSocket frame"
            data-testid="findingFromWebSocket"
          >
            <FileText size={13} strokeWidth={1.7} />
            Finding
          </Button>
        </div>

        <div className="grid gap-px border-b border-rule bg-rule [grid-template-columns:repeat(3,minmax(0,1fr))]">
          {[
            ["Errors", webSocketErrorCount],
            ["Selected", selectedWebSocketEvent ? websocketFrameKind(selectedWebSocketEvent) : "none"],
            ["Scope", selectedWebSocketEvent?.allowed ? "in" : "out"]
          ].map(([label, value]) => (
            <div key={label} className="bg-ink/35 px-3 py-2">
              <span className="block rd-eyebrow text-muted">{label}</span>
              <strong className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label uppercase tracking-key text-bone">
                {value}
              </strong>
            </div>
          ))}
        </div>

        {selectedWebSocketEvent && (
          <div className="grid gap-2 border-b border-rule px-4 py-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)_auto] max-[900px]:grid-cols-1">
            <Input
              variant="compact"
              value={webSocketAnnotationTags}
              onChange={(event) => setWebSocketAnnotationTags(event.target.value)}
              placeholder="tags: review, websocket"
              data-testid="webSocketTags"
            />
            <Input
              variant="compact"
              value={webSocketAnnotationComment}
              onChange={(event) => setWebSocketAnnotationComment(event.target.value)}
              placeholder="comment"
              data-testid="webSocketComment"
            />
            <Button
              variant="outline"
              size="compact"
              onClick={() => {
                void saveEvidenceAnnotation({
                  evidenceId: selectedWebSocketEvent.id,
                  kind: "websocket",
                  tags: webSocketAnnotationTags
                    .split(",")
                    .map((tag) => tag.trim().toLowerCase())
                    .filter(Boolean),
                  comment: webSocketAnnotationComment,
                  updatedAt: new Date().toISOString()
                });
              }}
              data-testid="saveWebSocketAnnotation"
            >
              Save note
            </Button>
          </div>
        )}

        <pre className="min-h-0 flex-1 select-text cursor-text radar-pre-gradient px-5 py-4" data-testid="webSocketDetailText">
          {selectedWebSocketDetail}
        </pre>
      </div>
    </div>
  );
}
