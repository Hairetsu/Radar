import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiModelOption } from "../../shared/ai-types.js";
import { pickValidModel, sanitizeModelId, stripAnsi } from "../../shared/ai-models.js";
import { parseModelLines } from "./modelParse.js";

const MAX_BUFFER_CHARS = 300_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const MODEL_CACHE_MS = 60_000;
const GROK_SYSTEM_OVERRIDE = [
  "You are running as Radar's local Grok analysis provider.",
  "Analyze only the context supplied in the prompt. Do not use tools, do not modify files, do not execute shell commands, and do not navigate browsers.",
  "Return exactly one JSON object that matches the requested task schema. Do not wrap it in Markdown."
].join(" ");
const GROK_JSON_SCHEMA = '{"type":"object"}';
const GROK_MAX_TURNS = "4";

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type ProcessEnv = Record<string, string | undefined>;

type RunProcessOptions = {
  cwd?: string;
  env?: ProcessEnv;
  timeoutMs?: number;
};

let cachedModels: { at: number; models: AiModelOption[] } | null = null;

export function resetGrokCliModelCacheForTests() {
  cachedModels = null;
}

function grokHome() {
  const fromEnv = process.env.GROK_HOME?.trim();
  return fromEnv || path.join(os.homedir(), ".grok");
}

function grokCliCandidates() {
  const home = os.homedir();
  return [
    process.env.GROK_CLI_PATH,
    process.env.GROK_CLI_BIN,
    process.env.GROK_PATH,
    path.join(grokHome(), "bin", "grok"),
    path.join(home, ".local", "bin", "grok"),
    "/opt/homebrew/bin/grok",
    "/usr/local/bin/grok",
    "grok"
  ].filter((item): item is string => Boolean(item));
}

function isCommandName(candidate: string) {
  return !candidate.includes(path.sep);
}

function isExecutable(candidate: string) {
  if (isCommandName(candidate)) {
    return true;
  }

  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function appendLimited(current: string, chunk: Buffer) {
  const next = current + chunk.toString("utf8");
  return next.length > MAX_BUFFER_CHARS ? next.slice(next.length - MAX_BUFFER_CHARS) : next;
}

function trimDetail(value: string) {
  return sanitizeModelId(value).replace(/\s+/g, " ").slice(0, 600);
}

function isAuthFailure(value: string) {
  return /authentication required|not logged in|not authenticated|please log in|run `?grok login`?|sign in/i.test(
    value
  );
}

function grokCliEnv(apiKey?: string) {
  const home = process.env.HOME || os.homedir();
  const pathEntries = [
    path.join(grokHome(), "bin"),
    path.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH
  ].filter(Boolean);
  const env: ProcessEnv = {
    ...process.env,
    HOME: home,
    PATH: pathEntries.join(path.delimiter),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: "dumb",
    GROK_DISABLE_AUTOUPDATER: "1",
    RUST_LOG: process.env.RUST_LOG || "off"
  };
  const resolvedApiKey = apiKey?.trim();
  if (resolvedApiKey) {
    env.XAI_API_KEY = resolvedApiKey;
  }
  return env;
}

function resolveGrokApiKey(settingsApiKey?: string) {
  const fromEnv = process.env.XAI_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const saved = settingsApiKey?.trim();
  if (saved && saved !== "local") {
    return saved;
  }

  return "";
}

function runProcess(command: string, args: string[], options: RunProcessOptions = {}) {
  return new Promise<ProcessResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || grokCliEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1000).unref();
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    timeout.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.once("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (exitCode) => {
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export function resolveGrokCliPath() {
  return grokCliCandidates().find(isExecutable) || "grok";
}

export function readGrokAuthInfo() {
  try {
    const raw = fs.readFileSync(path.join(grokHome(), "auth.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const email = (value as Record<string, unknown>).email;
      if (typeof email === "string" && email.trim()) {
        return { email: email.trim() };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function parseGrokModelOutput(text: string): AiModelOption[] {
  const trimmed = stripAnsi(String(text || "")).replace(/\r/g, "").trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseModelLines(trimmed);
  }

  const seen = new Set<string>();
  const models: AiModelOption[] = [];
  const push = (raw: string) => {
    const token = sanitizeModelId(raw).replace(/[(),]/g, "").split(/\s+/)[0] || "";
    if (!token || seen.has(token) || /^(you|are|logged|available|models|default|model)$/i.test(token)) {
      return;
    }
    seen.add(token);
    models.push({ id: token, label: token });
  };

  for (const line of trimmed.split(/\n/)) {
    const defaultMatch = line.match(/^\s*Default model:\s+(\S+)/i);
    if (defaultMatch) {
      push(defaultMatch[1]);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(\S+)/);
    if (bullet) {
      push(bullet[1]);
    }
  }

  if (models.length === 0) {
    return [];
  }
  if (!seen.has("auto")) {
    return [{ id: "auto", label: "auto" }, ...models];
  }
  return models;
}

export async function probeGrokCli(apiKey?: string) {
  const command = resolveGrokCliPath();
  const env = grokCliEnv(resolveGrokApiKey(apiKey));

  try {
    const versionResult = await runProcess(command, ["--version"], { timeoutMs: 8000, env });
    const version = trimDetail(versionResult.stdout || versionResult.stderr || command);
    if (versionResult.exitCode !== 0) {
      return {
        ok: false,
        message: `Grok CLI returned ${versionResult.exitCode ?? "no exit code"}${version ? `: ${version}` : "."}`,
        executablePath: command
      };
    }

    const modelsResult = await runProcess(command, ["models"], { timeoutMs: 15000, env });
    const modelsText = trimDetail(modelsResult.stdout || modelsResult.stderr);
    if (modelsResult.exitCode !== 0 || isAuthFailure(modelsText)) {
      return {
        ok: false,
        message: `Grok CLI not authenticated. Click Sign in with Grok in settings, run \`grok login\`, or set XAI_API_KEY.${modelsText ? ` ${modelsText}` : ""}`,
        executablePath: command
      };
    }

    const auth = readGrokAuthInfo();
    const linked = auth?.email
      ? ` Linked as ${auth.email}.`
      : /logged in/i.test(modelsResult.stdout)
        ? ` ${trimDetail(modelsResult.stdout.split("\n")[0] || "")}`
        : "";

    return {
      ok: true,
      message: `Grok CLI ready${version ? ` (${version})` : ""}.${linked}`,
      executablePath: command
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      message: `Grok CLI not found. Install Grok Build CLI, run \`grok login\`, or set GROK_CLI_PATH. ${detail}`,
      executablePath: command
    };
  }
}

export async function loginGrokCli() {
  const command = resolveGrokCliPath();

  try {
    const result = await runProcess(command, ["login"], { timeoutMs: 180_000 });
    if (result.exitCode !== 0) {
      const detail = trimDetail(result.stderr || result.stdout);
      return {
        ok: false,
        message: detail || "Grok login failed."
      };
    }

    return probeGrokCli();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      message: `Grok login failed. ${detail}`
    };
  }
}

export async function listGrokCliModels(apiKey?: string) {
  if (cachedModels && Date.now() - cachedModels.at < MODEL_CACHE_MS) {
    return cachedModels.models;
  }

  const command = resolveGrokCliPath();

  try {
    const result = await runProcess(command, ["models"], {
      timeoutMs: 15000,
      env: grokCliEnv(resolveGrokApiKey(apiKey))
    });
    const models = parseGrokModelOutput(result.stdout || result.stderr);
    if (models.length === 0) {
      throw new Error(trimDetail(result.stderr || result.stdout) || "Could not list Grok models.");
    }

    cachedModels = { at: Date.now(), models };
    return models;
  } catch {
    return [{ id: "auto", label: "auto" }];
  }
}

export async function resolveGrokCliModel(model?: string, available?: AiModelOption[]) {
  const models = available || (await listGrokCliModels());
  const requested = sanitizeModelId(model || "");
  const settingsModel = pickValidModel(requested, models);

  if (!requested || requested === "auto" || requested === "grok-local") {
    return { cliModel: undefined as string | undefined, settingsModel, correctedFrom: undefined as string | undefined };
  }

  if (models.some((entry) => entry.id === requested)) {
    return { cliModel: requested, settingsModel: requested, correctedFrom: undefined };
  }

  return { cliModel: undefined, settingsModel, correctedFrom: requested };
}

function grokPrompt(system: string, user: string) {
  return [
    "TASK INSTRUCTIONS",
    system.trim(),
    "",
    "RADAR CONTEXT",
    user.trim()
  ].join("\n");
}

export function extractGrokCliText(stdout: string) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    return "";
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;

  try {
    const payload = JSON.parse(candidate) as Record<string, unknown>;
    if (payload.type === "error") {
      for (const key of ["text", "result"]) {
        const value = payload[key];
        if (typeof value === "string" && value.trim().startsWith("{")) {
          return value.trim();
        }
      }
      const message = typeof payload.message === "string" ? payload.message.trim() : "";
      throw new Error(message || "Grok CLI returned an error.");
    }
    for (const key of ["text", "result", "message", "content"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return trimmed;
    }
    throw error;
  }

  return trimmed;
}

export async function runGrokCliCompletion({
  system,
  user,
  model,
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  system: string;
  user: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}) {
  const command = resolveGrokCliPath();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "radar-grok-"));
  const promptFile = path.join(workspace, "prompt.txt");

  try {
    const available = await listGrokCliModels(apiKey);
    const { cliModel } = await resolveGrokCliModel(model, available);
    const resolvedApiKey = resolveGrokApiKey(apiKey);
    fs.writeFileSync(promptFile, grokPrompt(system, user), "utf8");

    const args = [
      "--prompt-file",
      promptFile,
      "--output-format",
      "json",
      "--json-schema",
      GROK_JSON_SCHEMA,
      "--verbatim",
      "--sandbox",
      "read-only",
      "--max-turns",
      GROK_MAX_TURNS,
      "--tools",
      "",
      "--no-subagents",
      "--no-plan",
      "--disable-web-search",
      "--no-auto-update",
      "--permission-mode",
      "dontAsk",
      "--cwd",
      workspace,
      "--system-prompt-override",
      GROK_SYSTEM_OVERRIDE,
      "--disallowed-tools",
      "Agent,run_terminal_cmd,search_replace,web_search,web_fetch"
    ];
    if (cliModel) {
      args.push("--model", cliModel);
    }

    let result: ProcessResult;
    try {
      result = await runProcess(command, args, {
        cwd: workspace,
        env: grokCliEnv(resolvedApiKey),
        timeoutMs
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown process error";
      throw new Error(
        `Grok CLI is unavailable at ${command}. Install Grok Build CLI or set GROK_CLI_PATH, then reconnect AI. ${detail}`
      );
    }

    let text = "";
    try {
      text = extractGrokCliText(result.stdout);
    } catch (error) {
      if (result.exitCode === 0) {
        throw error;
      }
    }
    const usableAnswer = text.startsWith("{") && !/"sessionId"\s*:/.test(text);
    if (result.exitCode !== 0) {
      if (usableAnswer) {
        return text;
      }
      const detail = trimDetail(result.stderr || result.stdout);
      if (/max turns?/i.test(detail)) {
        throw new Error(
          `Grok CLI stopped after its turn budget${detail ? `: ${detail}` : "."} Radar runs Grok without tools so the model can answer in one pass.`
        );
      }
      throw new Error(`Grok CLI run failed (${result.exitCode ?? "no exit code"})${detail ? `: ${detail}` : "."}`);
    }
    if (!text) {
      throw new Error("Grok CLI returned an empty response.");
    }

    return text;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
