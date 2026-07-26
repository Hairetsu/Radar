import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatCapturedRequest,
  isAllowedTarget,
  type RequestExportFormat
} from "../../lib";
import { redactSensitiveHeaders, redactSensitiveText } from "../../../shared/redaction.js";
import { filterCapturesByQuery } from "../../../shared/trafficQuery.js";
import { annotationContext } from "../../../shared/evidenceTags.js";
import type { CapturedRequest, EvidenceAnnotation } from "../../types";
import type { NavigationPort, NoticePort } from "./ports";

export type TrafficSortField = "time" | "method" | "status" | "host" | "path" | "type" | "duration";
export type TrafficSortDirection = "asc" | "desc";

export const TRAFFIC_SORT_FIELDS: { value: TrafficSortField; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "method", label: "Method" },
  { value: "status", label: "Status" },
  { value: "host", label: "Host" },
  { value: "path", label: "Path" },
  { value: "type", label: "Type" },
  { value: "duration", label: "Duration" }
];

const methodSortOrder = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function compareMethods(left: string, right: string) {
  const leftIndex = methodSortOrder.indexOf(left);
  const rightIndex = methodSortOrder.indexOf(right);
  const normalizedLeft = leftIndex === -1 ? methodSortOrder.length : leftIndex;
  const normalizedRight = rightIndex === -1 ? methodSortOrder.length : rightIndex;
  return normalizedLeft - normalizedRight || left.localeCompare(right);
}

function sortedMethods(methods: string[]) {
  return [...methods].sort(compareMethods);
}

function compareNullableNumber(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function compareTrafficCaptures(
  left: CapturedRequest,
  right: CapturedRequest,
  field: TrafficSortField,
  direction: TrafficSortDirection
) {
  let result = 0;
  switch (field) {
    case "time":
      result = left.startedAt.localeCompare(right.startedAt);
      break;
    case "method":
      result = compareMethods(left.method, right.method);
      break;
    case "status":
      result = compareNullableNumber(left.status, right.status);
      break;
    case "host":
      result = left.host.localeCompare(right.host);
      break;
    case "path":
      result = left.path.localeCompare(right.path);
      break;
    case "type":
      result = (left.type || left.source).localeCompare(right.type || right.source);
      break;
    case "duration":
      result = compareNullableNumber(left.durationMs, right.durationMs);
      break;
  }
  if (result === 0) {
    result = left.id.localeCompare(right.id);
  }
  return direction === "asc" ? result : -result;
}

export type TrafficDomainPorts = NoticePort &
  NavigationPort & {
    targets: string[];
    evidenceAnnotations: EvidenceAnnotation[];
  };

export type TrafficDomain = ReturnType<typeof useTrafficDomain>;

export function useTrafficDomain(ports: TrafficDomainPorts) {
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef("");
  const [trafficMethodFilter, setTrafficMethodFilter] = useState("all");
  const [trafficTypeFilter, setTrafficTypeFilter] = useState("all");
  const [trafficSearch, setTrafficSearch] = useState("");
  const [trafficQueryError, setTrafficQueryError] = useState("");
  const trafficSearchRef = useRef<HTMLInputElement | null>(null);
  const [trafficSortField, setTrafficSortField] = useState<TrafficSortField>("time");
  const [trafficSortDirection, setTrafficSortDirection] = useState<TrafficSortDirection>("desc");

  const queryContext = useMemo(
    () => annotationContext(ports.evidenceAnnotations),
    [ports.evidenceAnnotations]
  );

  const scopedTrafficCaptures = useMemo(
    () => captures.filter((capture) => isAllowedTarget(capture.url, ports.targets)),
    [captures, ports.targets]
  );

  const trafficQueryResult = useMemo(
    () => filterCapturesByQuery(scopedTrafficCaptures, trafficSearch, queryContext),
    [scopedTrafficCaptures, trafficSearch, queryContext]
  );

  useEffect(() => {
    setTrafficQueryError(trafficQueryResult.ok ? "" : trafficQueryResult.error);
  }, [trafficQueryResult]);

  const trafficMethods = useMemo(
    () => sortedMethods(Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.method).filter(Boolean)))),
    [scopedTrafficCaptures]
  );

  const trafficTypes = useMemo(
    () =>
      Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.type).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [scopedTrafficCaptures]
  );

  const trafficCaptures = useMemo(() => {
    const base = trafficQueryResult.ok ? trafficQueryResult.captures : [];
    const filtered = base.filter((capture) => {
      const methodMatches = trafficMethodFilter === "all" || capture.method === trafficMethodFilter;
      const typeMatches = trafficTypeFilter === "all" || capture.type === trafficTypeFilter;
      return methodMatches && typeMatches;
    });
    return [...filtered].sort((left, right) =>
      compareTrafficCaptures(left, right, trafficSortField, trafficSortDirection)
    );
  }, [
    trafficQueryResult,
    trafficMethodFilter,
    trafficTypeFilter,
    trafficSortField,
    trafficSortDirection
  ]);

  const selected = useMemo(
    () => trafficCaptures.find((capture) => capture.id === selectedId) || trafficCaptures[0] || null,
    [trafficCaptures, selectedId]
  );

  const selectTrafficCapture = useCallback(
    (captureId: string, event?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
      const meta = Boolean(event?.metaKey || event?.ctrlKey);
      const shift = Boolean(event?.shiftKey);

      setSelectedId(captureId);

      setSelectedIds((current) => {
        if (shift && selectionAnchorRef.current) {
          const ids = trafficCaptures.map((capture) => capture.id);
          const start = ids.indexOf(selectionAnchorRef.current);
          const end = ids.indexOf(captureId);
          if (start === -1 || end === -1) {
            if (meta) {
              return current.includes(captureId)
                ? current.filter((id) => id !== captureId)
                : [...current, captureId];
            }
            return [captureId];
          }
          const [from, to] = start < end ? [start, end] : [end, start];
          return ids.slice(from, to + 1);
        }

        if (meta) {
          return current.includes(captureId) ? current.filter((id) => id !== captureId) : [...current, captureId];
        }

        selectionAnchorRef.current = captureId;
        return [captureId];
      });
    },
    [trafficCaptures]
  );

  const clearCaptures = useCallback(async () => {
    await window.radar?.clearCaptures();
    setCaptures([]);
    setSelectedId("");
    setSelectedIds([]);
    selectionAnchorRef.current = "";
  }, []);

  const deleteCapture = useCallback(async (captureId: string) => {
    if (!captureId) {
      return;
    }
    try {
      await window.radar?.deleteCapture(captureId);
      setCaptures((items) => items.filter((capture) => capture.id !== captureId));
      setSelectedId((current) => (current === captureId ? "" : current));
      setSelectedIds((current) => current.filter((id) => id !== captureId));
      if (selectionAnchorRef.current === captureId) {
        selectionAnchorRef.current = "";
      }
      ports.setNotice("Capture deleted");
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Delete failed");
    }
  }, [ports]);

  const bulkDeleteCaptures = useCallback(
    async (captureIds: string[]) => {
      for (const captureId of captureIds) {
        await window.radar?.deleteCapture(captureId);
      }
      setCaptures((items) => items.filter((capture) => !captureIds.includes(capture.id)));
      setSelectedIds((current) => current.filter((id) => !captureIds.includes(id)));
      if (captureIds.includes(selectedId)) {
        setSelectedId("");
      }
      ports.setNotice(`Deleted ${captureIds.length} capture${captureIds.length === 1 ? "" : "s"}`);
    },
    [ports, selectedId]
  );

  const bulkExportCaptures = useCallback(
    async (captureIds: string[], format: RequestExportFormat = "raw") => {
      const selectedCaptures = captures.filter((capture) => captureIds.includes(capture.id));
      if (selectedCaptures.length === 0) {
        return;
      }
      const text = selectedCaptures
        .map((capture) =>
          formatCapturedRequest(
            {
              ...capture,
              requestHeaders: redactSensitiveHeaders(capture.requestHeaders),
              requestBody: redactSensitiveText(capture.requestBody)
            },
            format
          )
        )
        .join("\n\n");
      try {
        await window.navigator.clipboard.writeText(text);
        ports.setNotice(`Exported ${selectedCaptures.length} capture${selectedCaptures.length === 1 ? "" : "s"}`);
      } catch {
        ports.setNotice("Export failed");
      }
    },
    [captures, ports]
  );

  const bulkTagCaptures = useCallback(
    async (captureIds: string[], tag: string) => {
      if (!window.radar?.saveEvidenceAnnotations) {
        ports.setNotice("Run in Electron to bulk tag captures.");
        return;
      }
      const normalizedTag = tag.trim().toLowerCase();
      if (!normalizedTag) {
        return;
      }
      const annotations = captureIds.map((captureId) => {
        const existing = ports.evidenceAnnotations.find(
          (ann) => ann.kind === "capture" && ann.evidenceId === captureId
        ) || {
          evidenceId: captureId,
          kind: "capture" as const,
          tags: [],
          comment: "",
          updatedAt: ""
        };
        const tags = existing.tags.includes(normalizedTag) ? existing.tags : [...existing.tags, normalizedTag];
        return { ...existing, tags, updatedAt: new Date().toISOString() };
      });
      await window.radar.saveEvidenceAnnotations(annotations);
      ports.setNotice(`Tagged ${captureIds.length} capture${captureIds.length === 1 ? "" : "s"}`);
    },
    [ports]
  );

  return {
    captures,
    setCaptures,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectTrafficCapture,
    selected,
    scopedTrafficCaptures,
    trafficMethodFilter,
    setTrafficMethodFilter,
    trafficTypeFilter,
    setTrafficTypeFilter,
    trafficMethods,
    trafficTypes,
    trafficSearch,
    setTrafficSearch,
    trafficQueryError,
    trafficSearchRef,
    trafficSortField,
    setTrafficSortField,
    trafficSortDirection,
    setTrafficSortDirection,
    trafficCaptures,
    clearCaptures,
    deleteCapture,
    bulkDeleteCaptures,
    bulkExportCaptures,
    bulkTagCaptures,
    selectionAnchorRef
  };
}
