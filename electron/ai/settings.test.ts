import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";

describe("settings", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("returns defaults when file is missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    expect(loadSettings(tmpDir)).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial saved settings", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    saveSettings(tmpDir, { model: "custom-model" });
    expect(loadSettings(tmpDir).model).toBe("custom-model");
    expect(loadSettings(tmpDir).provider).toBe(DEFAULT_SETTINGS.provider);
  });

  it("strips ansi codes from saved and loaded models", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    saveSettings(tmpDir, { model: "[36mgpt-5.3-codex[39m" });
    expect(loadSettings(tmpDir).model).toBe("gpt-5.3-codex");
  });

  it("falls back to default model when saved model is blank", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    saveSettings(tmpDir, { model: "[36m[39m" });
    expect(loadSettings(tmpDir).model).toBe(DEFAULT_SETTINGS.model);
  });

  it("returns defaults when settings file is invalid json", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    fs.writeFileSync(path.join(tmpDir, "ai-settings.json"), "{not-json");
    expect(loadSettings(tmpDir)).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes saved settings", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    const saved = saveSettings(tmpDir, {
      provider: "anthropic",
      model: "123",
      apiKey: "",
      baseUrl: DEFAULT_SETTINGS.baseUrl
    });
    expect(saved).toEqual({
      provider: "anthropic",
      model: "123",
      apiKey: "",
      baseUrl: DEFAULT_SETTINGS.baseUrl
    });
  });
});
