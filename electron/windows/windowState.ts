import fs from "node:fs";
import type { Rectangle } from "electron";

type PersistedWindowState = {
  aiOperatorBounds?: Rectangle;
};

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const input = value as Partial<Rectangle>;
  return [input.x, input.y, input.width, input.height].every((item) => Number.isFinite(item));
}

export function readAiOperatorBounds(stateFile: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8")) as PersistedWindowState;
    return isRectangle(parsed.aiOperatorBounds) ? parsed.aiOperatorBounds : null;
  } catch {
    return null;
  }
}

export function writeAiOperatorBounds(stateFile: string, bounds: Rectangle) {
  const temporaryFile = `${stateFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({ aiOperatorBounds: bounds }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, stateFile);
}

export function clampWindowBounds(bounds: Rectangle, workArea: Rectangle, minimum = { width: 760, height: 640 }) {
  const width = Math.min(Math.max(Math.round(bounds.width), minimum.width), workArea.width);
  const height = Math.min(Math.max(Math.round(bounds.height), minimum.height), workArea.height);
  const x = Math.min(Math.max(Math.round(bounds.x), workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(Math.round(bounds.y), workArea.y), workArea.y + workArea.height - height);
  return { x, y, width, height };
}

