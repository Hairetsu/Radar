import { bodyPreview } from "../text";
import { formatHeaders } from "../headers";
import type {
  WebSocketDirection,
  WebSocketEvent
} from "../../types";
import type { StatusTone } from "./statusTone";

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}mb`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}kb`;
  }
  return `${value}b`;
}

export function websocketDirectionTone(
  direction: WebSocketDirection
): StatusTone {
  if (direction === "received") {
    return "move";
  }
  if (direction === "sent") {
    return "good";
  }
  if (direction === "error") {
    return "danger";
  }
  if (direction === "closed") {
    return "warn";
  }
  return "ghost";
}

export function websocketFrameKind(event: WebSocketEvent) {
  if (event.direction === "handshake") {
    return event.status ? `HTTP ${event.status}` : "handshake";
  }
  if (event.direction === "closed" || event.direction === "error") {
    return event.direction;
  }
  if (event.opcode === 1) return "text";
  if (event.opcode === 2) return "binary";
  if (event.opcode === 8) return "close";
  if (event.opcode === 9) return "ping";
  if (event.opcode === 10) return "pong";
  return `op ${event.opcode ?? "?"}`;
}

export function websocketPayloadPreview(event: WebSocketEvent) {
  if (event.error) {
    return event.error;
  }
  if (event.payloadData) {
    return event.payloadData.replace(/\s+/g, " ").trim();
  }
  return event.statusText || event.direction;
}

export function websocketDetailText(
  event: WebSocketEvent | null
) {
  if (!event) {
    return "";
  }
  return [
    `${event.direction.toUpperCase()} ${event.url}`,
    `ID: ${event.requestId}`,
    `Host: ${event.host}`,
    `Kind: ${websocketFrameKind(event)}`,
    `Size: ${formatBytes(event.size)}`,
    event.status
      ? `Status: ${event.status} ${event.statusText || ""}`.trim()
      : "",
    event.error ? `Error: ${event.error}` : "",
    event.initiator ? `Initiator: ${event.initiator}` : "",
    "",
    "Request headers:",
    formatHeaders(event.requestHeaders || {}),
    "",
    "Response headers:",
    formatHeaders(event.responseHeaders || {}),
    "",
    "Payload:",
    bodyPreview(event.payloadData)
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
}
