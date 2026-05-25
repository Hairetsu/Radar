const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SETTINGS = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "http://127.0.0.1:11434/v1"
};

function settingsPath(userDataPath) {
  return path.join(userDataPath, "ai-settings.json");
}

function loadSettings(userDataPath) {
  const file = settingsPath(userDataPath);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(userDataPath, settings) {
  const file = settingsPath(userDataPath);
  const next = {
    provider: settings.provider || DEFAULT_SETTINGS.provider,
    model: String(settings.model || DEFAULT_SETTINGS.model),
    apiKey: String(settings.apiKey || ""),
    baseUrl: String(settings.baseUrl || DEFAULT_SETTINGS.baseUrl)
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { DEFAULT_SETTINGS, loadSettings, saveSettings };
