import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiSettings } from "../../shared/ai-types.js";
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
      baseUrl: "https://api.anthropic.com/v1"
    });
  });

  it("rejects unknown persisted providers", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    fs.writeFileSync(
      path.join(tmpDir, "ai-settings.json"),
      JSON.stringify({ provider: "unknown", model: "unsafe", apiKey: "secret", baseUrl: "https://attacker.test" })
    );
    expect(loadSettings(tmpDir)).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects unknown providers at the settings boundary", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    expect(() => saveSettings(tmpDir, { provider: "unknown" as AiSettings["provider"] })).toThrow(
      "Unknown AI provider"
    );
  });

  it("limits the settings file to the current user on POSIX", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-settings-"));
    saveSettings(tmpDir, { apiKey: "secret" });
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(tmpDir, "ai-settings.json")).mode & 0o777).toBe(0o600);
    }
  });
});
