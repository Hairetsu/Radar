import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clampWindowBounds, readAiOperatorBounds, writeAiOperatorBounds } from "./windowState.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("AI Operator window state", () => {
  it("writes and restores bounds atomically", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-window-state-"));
    temporaryDirectories.push(directory);
    const stateFile = path.join(directory, "window-state.json");
    const bounds = { x: 120, y: 80, width: 1040, height: 840 };

    writeAiOperatorBounds(stateFile, bounds);

    expect(readAiOperatorBounds(stateFile)).toEqual(bounds);
    expect(fs.existsSync(`${stateFile}.tmp`)).toBe(false);
  });

  it("fails closed on malformed state and clamps removed-display placement", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-window-state-"));
    temporaryDirectories.push(directory);
    const stateFile = path.join(directory, "window-state.json");
    fs.writeFileSync(stateFile, JSON.stringify({ aiOperatorBounds: { x: "secret", width: 12 } }));

    expect(readAiOperatorBounds(stateFile)).toBeNull();
    expect(clampWindowBounds(
      { x: 4_000, y: -900, width: 420, height: 300 },
      { x: 0, y: 0, width: 1_440, height: 900 }
    )).toEqual({ x: 680, y: 0, width: 760, height: 640 });
  });
});
