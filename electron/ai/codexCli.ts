import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_BUFFER_CHARS = 300_000;
const DEFAULT_TIMEOUT_MS = 180_000;

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

function codexCliCandidates() {
  return [
    process.env.CODEX_CLI_PATH,
    process.env.CODEX_PATH,
    /* v8 ignore next -- platform-specific candidate is covered on the active OS only. */
    process.platform === "darwin" ? "/Applications/Codex.app/Contents/Resources/codex" : "",
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex"
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
  return value.trim().replace(/\s+/g, " ").slice(0, 600);
}

function runProcess(command: string, args: string[], options: RunProcessOptions = {}) {
  return new Promise<ProcessResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    /* v8 ignore start -- process timeout behavior is defensive and slow to exercise in unit tests. */
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
    /* v8 ignore stop */
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

    child.stdin.end(options.input || "");
  });
}

export function resolveCodexCliPath() {
  return codexCliCandidates().find(isExecutable) || "codex";
}

export async function probeCodexCli() {
  const command = resolveCodexCliPath();

  try {
    const result = await runProcess(command, ["--version"], { timeoutMs: 8000 });
    const version = trimDetail(result.stdout || result.stderr || command);
    if (result.exitCode === 0) {
      return {
        ok: true,
        message: `Codex CLI ready${version ? ` (${version})` : ""}.`,
        executablePath: command
      };
    }

    return {
      ok: false,
      message: `Codex CLI returned ${result.exitCode ?? "no exit code"}${version ? `: ${version}` : "."}`,
      executablePath: command
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      message: `Codex CLI not found. Install Codex.app or set CODEX_CLI_PATH. ${detail}`,
      executablePath: command
    };
  }
}

function codexPrompt(system: string, user: string) {
  return [
    "You are running as Radar's local Codex analysis provider.",
    "Analyze only the context supplied below. Do not modify files, do not execute network actions, and do not navigate browsers.",
    "Return exactly one JSON object that matches the requested task schema. Do not wrap it in Markdown.",
    "",
    "TASK INSTRUCTIONS",
    system.trim(),
    "",
    "RADAR CONTEXT",
    user.trim()
  ].join("\n");
}

export async function runCodexCliCompletion({
  system,
  user,
  model,
  cwd,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  system: string;
  user: string;
  model?: string;
  cwd?: string;
  timeoutMs?: number;
}) {
  const command = resolveCodexCliPath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-codex-"));
  const outputFile = path.join(tempDir, "response.txt");

  try {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--output-last-message",
      outputFile
    ];
    const selectedModel = model?.trim();
    if (selectedModel && selectedModel !== "auto" && selectedModel !== "codex-local") {
      args.push("--model", selectedModel);
    }
    args.push("-");

    const result = await runProcess(command, args, {
      cwd,
      input: codexPrompt(system, user),
      timeoutMs
    });

    const text = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8").trim() : result.stdout.trim();
    if (result.exitCode !== 0) {
      const detail = trimDetail(result.stderr || result.stdout);
      throw new Error(`Codex local run failed (${result.exitCode ?? "no exit code"})${detail ? `: ${detail}` : "."}`);
    }
    if (!text) {
      throw new Error("Codex local run returned an empty response.");
    }

    return text;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
