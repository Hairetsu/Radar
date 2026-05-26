import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiModelOption } from "../../shared/ai-types.js";
import { parseAvailableModels, parseModelLines } from "./modelParse.js";
import { pickValidModel, sanitizeModelId } from "../../shared/ai-models.js";

const MAX_BUFFER_CHARS = 300_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const MODEL_CACHE_MS = 60_000;

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type RunProcessOptions = {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
};

let cachedModels: { at: number; models: AiModelOption[] } | null = null;

export function resetCursorCliModelCacheForTests() {
  cachedModels = null;
}

function cursorCliCandidates() {
  const home = os.homedir();
  return [
    process.env.CURSOR_AGENT_BIN,
    process.env.CURSOR_CLI_BIN,
    process.env.CURSOR_CLI_PATH,
    path.join(home, ".local", "bin", "agent"),
    path.join(home, ".cursor", "bin", "agent"),
    "/opt/homebrew/bin/agent",
    "/usr/local/bin/agent",
    "cursor-agent",
    "agent"
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

function isCursorRetryLoop(value: string) {
  return /connection lost|reconnecting|failed to run step|exceeded max retries|streamfromagentbackend|getagentstreamresponse/i.test(
    value
  );
}

function cursorRetryLoopError(detail: string) {
  const suffix = detail ? ` Cursor output: ${detail}` : "";
  return [
    "Cursor agent could not keep its backend stream open.",
    "This is usually a Cursor service or transport issue, not a Radar issue.",
    "Start a new Cursor chat, toggle Cursor's HTTP/2 compatibility setting, switch away from Auto/Composer 2.5, or use another Radar provider while Cursor recovers.",
    suffix
  ].join(" ");
}

function cursorAgentEnv() {
  const home = process.env.HOME || os.homedir();
  const pathEntries = [
    path.join(home, ".local", "bin"),
    path.join(home, ".cursor", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH
  ].filter(Boolean);

  return {
    ...process.env,
    HOME: home,
    PATH: pathEntries.join(path.delimiter),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: "dumb"
  };
}

export function readCursorAuthInfo() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".cursor", "cli-config.json"), "utf8");
    const parsed = JSON.parse(raw) as { authInfo?: { email?: string; userId?: number } };
    const email = parsed.authInfo?.email?.trim();
    if (!email) {
      return null;
    }
    return { email, userId: parsed.authInfo?.userId };
  } catch {
    return null;
  }
}

function resolveCursorApiKey(settingsApiKey?: string) {
  for (const key of ["CURSOR_API_KEY", "CURSOR_AUTH_TOKEN"]) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
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
      env: cursorAgentEnv(),
      stdio: ["pipe", "pipe", "pipe"]
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

    child.stdin.end(options.input || "");

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

export function resolveCursorCliPath() {
  return cursorCliCandidates().find(isExecutable) || "agent";
}

export async function probeCursorCli() {
  const command = resolveCursorCliPath();

  try {
    const versionResult = await runProcess(command, ["--version"], { timeoutMs: 8000 });
    const version = trimDetail(versionResult.stdout || versionResult.stderr || command);
    const statusResult = await runProcess(command, ["status"], { timeoutMs: 8000 });
    const statusText = trimDetail(statusResult.stdout || statusResult.stderr);

    if (statusResult.exitCode !== 0 || /authentication required|not logged in|not authenticated/i.test(statusText)) {
      return {
        ok: false,
        message: `Cursor agent not authenticated. Click Sign in with Cursor in settings.${statusText ? ` ${statusText}` : ""}`,
        executablePath: command
      };
    }

    const auth = readCursorAuthInfo();
    const linked = auth?.email ? ` Linked as ${auth.email}.` : statusText ? ` ${statusText}` : "";

    if (versionResult.exitCode === 0) {
      return {
        ok: true,
        message: `Cursor agent ready${version ? ` (${version})` : ""}.${linked}`,
        executablePath: command
      };
    }

    return {
      ok: false,
      message: `Cursor agent returned ${versionResult.exitCode ?? "no exit code"}${version ? `: ${version}` : "."}`,
      executablePath: command
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      message: `Cursor agent not found. Run \`curl https://cursor.com/install | bash\` and \`agent login\`, or set CURSOR_API_KEY. ${detail}`,
      executablePath: command
    };
  }
}

export async function loginCursorCli() {
  const command = resolveCursorCliPath();

  try {
    const result = await runProcess(command, ["login"], { timeoutMs: 120_000 });
    if (result.exitCode !== 0) {
      const detail = trimDetail(result.stderr || result.stdout);
      return {
        ok: false,
        message: detail || "Cursor login failed."
      };
    }

    return probeCursorCli();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      message: `Cursor login failed. ${detail}`
    };
  }
}

export async function listCursorCliModels() {
  if (cachedModels && Date.now() - cachedModels.at < MODEL_CACHE_MS) {
    return cachedModels.models;
  }

  const command = resolveCursorCliPath();

  try {
    const result = await runProcess(command, ["--list-models"], { timeoutMs: 15000 });
    let models: AiModelOption[] = [];
    if (result.exitCode === 0) {
      models = parseModelLines(result.stdout);
    } else {
      models = parseAvailableModels(result.stderr || result.stdout);
    }

    if (models.length === 0) {
      throw new Error(trimDetail(result.stderr || result.stdout) || "Could not list Cursor models.");
    }

    cachedModels = { at: Date.now(), models };
    return models;
  } catch {
    return [{ id: "auto", label: "auto" }];
  }
}

export async function resolveCursorCliModel(model?: string, available?: AiModelOption[]) {
  const models = available || (await listCursorCliModels());
  const requested = sanitizeModelId(model || "");
  const settingsModel = pickValidModel(requested, models);

  if (!requested || requested === "auto" || requested === "cursor-local") {
    return { cliModel: undefined as string | undefined, settingsModel, correctedFrom: undefined as string | undefined };
  }

  if (models.some((entry) => entry.id === requested)) {
    return { cliModel: requested, settingsModel: requested, correctedFrom: undefined };
  }

  return { cliModel: undefined, settingsModel, correctedFrom: requested };
}

function cursorPrompt(system: string, user: string) {
  return [
    "You are running as Radar's local Cursor analysis provider.",
    "Analyze only the context supplied below. Do not use tools, do not modify files, do not execute shell commands, and do not navigate browsers.",
    "Return exactly one JSON object that matches the requested task schema. Do not wrap it in Markdown.",
    "",
    "TASK INSTRUCTIONS",
    system.trim(),
    "",
    "RADAR CONTEXT",
    user.trim()
  ].join("\n");
}

export function extractCursorAgentText(stdout: string) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    if (payload.type === "result" && typeof payload.result === "string" && payload.result.trim()) {
      return payload.result.trim();
    }
    for (const key of ["result", "text", "message", "content"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  } catch {
    // fall through to raw stdout
  }

  return trimmed;
}

export async function runCursorCliCompletion({
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
  const command = resolveCursorCliPath();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "radar-cursor-"));

  try {
    const available = await listCursorCliModels();
    const { cliModel } = await resolveCursorCliModel(model, available);
    const args = [
      "-p",
      "--output-format",
      "json",
      "--mode",
      "ask",
      "--trust",
      "--force",
      "--approve-mcps",
      "--workspace",
      workspace
    ];
    const resolvedApiKey = resolveCursorApiKey(apiKey);
    if (resolvedApiKey) {
      args.push("--api-key", resolvedApiKey);
    }
    if (cliModel) {
      args.push("--model", cliModel);
    }

    const result = await runProcess(command, args, {
      cwd: workspace,
      input: cursorPrompt(system, user),
      timeoutMs
    });

    const text = extractCursorAgentText(result.stdout);
    if (result.exitCode !== 0) {
      const detail = trimDetail(result.stderr || result.stdout);
      if (isCursorRetryLoop(detail)) {
        throw new Error(cursorRetryLoopError(detail));
      }
      throw new Error(`Cursor agent run failed (${result.exitCode ?? "no exit code"})${detail ? `: ${detail}` : "."}`);
    }
    if (!text) {
      throw new Error("Cursor agent returned an empty response.");
    }

    return text;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
