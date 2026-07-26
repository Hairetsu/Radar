import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

import { listCodexCliModels, probeCodexCli, resolveCodexCliPath, runCodexCliCompletion } from "./codexCli.js";

type MockSpawnOptions = {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: unknown;
  beforeClose?: (args: string[], input: string) => void;
};

function mockSpawn({ exitCode = 0, stdout = "", stderr = "", error, beforeClose }: MockSpawnOptions = {}) {
  let stdinInput = "";
  spawnMock.mockImplementation((_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: (input?: string) => void };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end: (input = "") => {
        stdinInput = input;
      }
    };
    child.kill = vi.fn();

    Promise.resolve().then(() => {
      if (error) {
        child.emit("error", error);
        return;
      }
      beforeClose?.(args, stdinInput);
      if (stdout) {
        child.stdout.emit("data", Buffer.from(stdout));
      }
      if (stderr) {
        child.stderr.emit("data", Buffer.from(stderr));
      }
      child.emit("close", exitCode);
    });

    return child;
  });
}

describe("codexCli", () => {
  const env = { ...process.env };
  let tmpDir = "";

  beforeEach(() => {
    process.env = { ...env };
    spawnMock.mockReset();
  });

  afterEach(() => {
    process.env = env;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("resolves explicit executable path from env", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-codex-test-"));
    const executable = path.join(tmpDir, "codex");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.CODEX_CLI_PATH = executable;

    expect(resolveCodexCliPath()).toBe(executable);
  });

  it("falls through missing env paths and accepts command names", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-codex-test-"));
    const executable = path.join(tmpDir, "codex-real");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.CODEX_CLI_PATH = path.join(tmpDir, "missing");
    process.env.CODEX_PATH = executable;

    expect(resolveCodexCliPath()).toBe(executable);

    process.env.CODEX_CLI_PATH = "codex";
    expect(resolveCodexCliPath()).toBe("codex");
  });

  it("discovers the Codex executable bundled with ChatGPT desktop on macOS", () => {
    if (process.platform !== "darwin") {
      return;
    }
    process.env.CODEX_CLI_PATH = "/missing/env/codex";
    process.env.CODEX_PATH = "/missing/legacy/codex";
    const bundled = "/Applications/ChatGPT.app/Contents/Resources/codex";
    const access = vi.spyOn(fs, "accessSync").mockImplementation((candidate) => {
      if (String(candidate) === bundled) {
        return;
      }
      throw new Error("ENOENT");
    });

    expect(resolveCodexCliPath()).toBe(bundled);
    access.mockRestore();
  });

  it("probes codex version", async () => {
    process.env.TERM = "xterm-256color";
    mockSpawn({ stdout: "codex 0.133.0\n" });

    const result = await probeCodexCli();

    expect(result.ok).toBe(true);
    expect(result.message).toContain("codex 0.133.0");
    expect(spawnMock.mock.calls[0][1]).toEqual(["--version"]);
    expect(spawnMock.mock.calls[0][2].env.TERM).toBe("xterm-256color");
  });

  it("reports codex probe errors", async () => {
    mockSpawn({ error: new Error("ENOENT") });

    const result = await probeCodexCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Codex CLI not found");
  });

  it("reports unknown codex probe errors", async () => {
    mockSpawn({ error: "bad" });

    const result = await probeCodexCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("unknown error");
  });

  it("reports non-zero codex probe exits", async () => {
    mockSpawn({ exitCode: 2, stderr: "not logged in" });

    const result = await probeCodexCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not logged in");
  });

  it("reports probes with no exit code or output", async () => {
    mockSpawn({ exitCode: null });

    const result = await probeCodexCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no exit code");
  });

  it("runs codex exec with a JSON output file", async () => {
    mockSpawn({
      beforeClose: (args, input) => {
        const outputFile = args[args.indexOf("--output-last-message") + 1];
        fs.writeFileSync(outputFile, '{"summary":"ok","observations":[],"uncertainties":[]}', "utf8");
        expect(input).toContain("TASK INSTRUCTIONS");
        expect(input).toContain("system text");
        expect(input).toContain("user text");
      }
    });

    const text = await runCodexCliCompletion({
      system: "system text",
      user: "user text",
      model: "auto",
      cwd: "/tmp"
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(text).toContain('"summary":"ok"');
    expect(args.slice(0, 3)).toEqual(["--ask-for-approval", "never", "exec"]);
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
    expect(args).not.toContain("--model");
  });

  it("passes explicit model and reports codex failures", async () => {
    mockSpawn({ exitCode: 1, stderr: "auth failed" });

    await expect(
      runCodexCliCompletion({
        system: "system",
        user: "user",
        model: "gpt-test"
      })
    ).rejects.toThrow("auth failed");

    expect(spawnMock.mock.calls[0][1]).toContain("gpt-test");
  });

  it("turns a missing executable during completion into actionable recovery guidance", async () => {
    mockSpawn({ error: new Error("spawn codex ENOENT") });

    await expect(
      runCodexCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("Install ChatGPT/Codex desktop or set CODEX_CLI_PATH");
  });

  it("falls back to stdout when codex output file is absent", async () => {
    mockSpawn({ stdout: '{"summary":"stdout"}' });

    await expect(
      runCodexCliCompletion({
        system: "system",
        user: "user"
      })
    ).resolves.toBe('{"summary":"stdout"}');
  });

  it("limits oversized codex process output", async () => {
    const hugeOutput = `${"x".repeat(300_100)}{"summary":"tail"}`;
    mockSpawn({ stdout: hugeOutput });

    const text = await runCodexCliCompletion({
      system: "system",
      user: "user"
    });

    expect(text.length).toBeLessThan(hugeOutput.length);
    expect(text.endsWith('{"summary":"tail"}')).toBe(true);
  });

  it("reports codex failures without detail", async () => {
    mockSpawn({ exitCode: null });

    await expect(
      runCodexCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("no exit code");
  });

  it("lists codex models from cli output", async () => {
    mockSpawn({ stdout: "auto\ncodex-mini\n" });

    await expect(listCodexCliModels()).resolves.toEqual([
      { id: "auto", label: "auto" },
      { id: "codex-mini", label: "codex-mini" }
    ]);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(["--list-models"]);
  });

  it("tries alternate codex list commands", async () => {
    spawnMock
      .mockImplementationOnce(() => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          stdin: { end: (input?: string) => void };
          kill: ReturnType<typeof vi.fn>;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end: vi.fn() };
        child.kill = vi.fn();
        Promise.resolve().then(() => child.emit("close", 1));
        return child;
      })
      .mockImplementationOnce((_command: string, args: string[]) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          stdin: { end: (input?: string) => void };
          kill: ReturnType<typeof vi.fn>;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end: vi.fn() };
        child.kill = vi.fn();
        Promise.resolve().then(() => {
          expect(args).toEqual(["models", "list"]);
          child.stdout.emit("data", Buffer.from("codex-mini\n"));
          child.emit("close", 0);
        });
        return child;
      });

    await expect(listCodexCliModels()).resolves.toEqual([{ id: "codex-mini", label: "codex-mini" }]);
  });

  it("falls back to auto when codex model listing fails", async () => {
    mockSpawn({ exitCode: 1, stderr: "unknown command" });
    await expect(listCodexCliModels()).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });

  it("rejects empty codex responses", async () => {
    mockSpawn();

    await expect(
      runCodexCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("empty response");
  });
});
