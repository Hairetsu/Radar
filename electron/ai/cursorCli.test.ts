import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

import { extractCursorAgentText, listCursorCliModels, loginCursorCli, probeCursorCli, readCursorAuthInfo, resetCursorCliModelCacheForTests, resolveCursorCliModel, resolveCursorCliPath, runCursorCliCompletion } from "./cursorCli.js";

type MockSpawnOptions = {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: unknown;
  beforeClose?: (args: string[], input?: string) => void;
  listExitCode?: number | null;
  listStdout?: string;
  listStderr?: string;
  statusExitCode?: number | null;
  statusStdout?: string;
  statusStderr?: string;
};

function createMockChild({
  exitCode = 0,
  stdout = "",
  stderr = "",
  error,
  beforeClose,
  args
}: MockSpawnOptions & { args: string[] }) {
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
      beforeClose?.(args, input);
    }
  };
  child.kill = vi.fn();

  Promise.resolve().then(() => {
    if (error) {
      child.emit("error", error);
      return;
    }
    if (stdout) {
      child.stdout.emit("data", Buffer.from(stdout));
    }
    if (stderr) {
      child.stderr.emit("data", Buffer.from(stderr));
    }
    child.emit("close", exitCode);
  });

  return child;
}

function mockSpawn({
  exitCode = 0,
  stdout = "",
  stderr = "",
  error,
  beforeClose,
  listExitCode = 0,
  listStdout = "auto\ngpt-test\n",
  listStderr = "",
  statusExitCode = 0,
  statusStdout = "Logged in",
  statusStderr = ""
}: MockSpawnOptions = {}) {
  spawnMock.mockImplementation((_command: string, args: string[]) => {
    if (args.includes("--list-models")) {
      return createMockChild({
        exitCode: listExitCode,
        stdout: listStdout,
        stderr: listStderr,
        args
      });
    }
    if (args.includes("status")) {
      return createMockChild({
        exitCode: statusExitCode,
        stdout: statusStdout,
        stderr: statusStderr,
        args
      });
    }
    if (args.includes("--version")) {
      return createMockChild({ stdout: "2026.03.11\n", args });
    }
    return createMockChild({ exitCode, stdout, stderr, error, beforeClose, args });
  });
}

describe("cursorCli", () => {
  const env = { ...process.env };
  let tmpDir = "";

  beforeEach(() => {
    process.env = { ...env };
    spawnMock.mockReset();
    resetCursorCliModelCacheForTests();
  });

  afterEach(() => {
    process.env = env;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("resolves explicit executable path from env", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-cursor-test-"));
    const executable = path.join(tmpDir, "agent");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.CURSOR_AGENT_BIN = executable;
    expect(resolveCursorCliPath()).toBe(executable);
  });

  it("falls through missing env paths and accepts command names", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-cursor-test-"));
    const executable = path.join(tmpDir, "agent-real");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.CURSOR_AGENT_BIN = path.join(tmpDir, "missing");
    process.env.CURSOR_CLI_BIN = executable;
    expect(resolveCursorCliPath()).toBe(executable);

    process.env.CURSOR_AGENT_BIN = "agent";
    expect(resolveCursorCliPath()).toBe("agent");
  });

  it("probes installed agent", async () => {
    mockSpawn({ statusStdout: "Logged in" });
    const probe = await probeCursorCli();
    expect(probe.ok).toBe(true);
    expect(probe.message).toContain("2026.03.11");
    expect(spawnMock.mock.calls.some((call) => call[1]?.includes("--version"))).toBe(true);
    expect(spawnMock.mock.calls.some((call) => call[1]?.includes("status"))).toBe(true);
  });

  it("reads linked cursor account info", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ authInfo: { email: "test@example.com", userId: 1 } })
    );
    expect(readCursorAuthInfo()).toEqual({ email: "test@example.com", userId: 1 });
    readSpy.mockRestore();
  });

  it("returns null when cursor auth info is missing", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("missing");
    });
    expect(readCursorAuthInfo()).toBeNull();
    readSpy.mockRestore();
  });

  it("returns null when cursor auth email is blank", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ authInfo: { email: "  " } }));
    expect(readCursorAuthInfo()).toBeNull();
    readSpy.mockRestore();
  });

  it("runs cursor browser login", async () => {
    mockSpawn({ statusStdout: "Logged in" });
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ stdout: "Logged in\n", args });
      }
      if (args.includes("status")) {
        return createMockChild({ stdout: "Logged in\n", args });
      }
      if (args.includes("--version")) {
        return createMockChild({ stdout: "2026.03.11\n", args });
      }
      return createMockChild({ args });
    });
    const probe = await loginCursorCli();
    expect(probe.ok).toBe(true);
    expect(spawnMock.mock.calls.some((call) => call[1]?.includes("login"))).toBe(true);
  });

  it("reports cursor login failure", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ exitCode: 1, stderr: "login cancelled\n", args });
      }
      return createMockChild({ args });
    });
    const probe = await loginCursorCli();
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("login cancelled");
  });

  it("reports cursor login spawn error", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ error: new Error("spawn failed"), args });
      }
      return createMockChild({ args });
    });
    const probe = await loginCursorCli();
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("spawn failed");
  });

  it("includes linked account in probe message", async () => {
    mockSpawn({ statusStdout: "Logged in" });
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ authInfo: { email: "linked@example.com" } })
    );
    const probe = await probeCursorCli();
    expect(probe.ok).toBe(true);
    expect(probe.message).toContain("linked@example.com");
    readSpy.mockRestore();
  });

  it("includes status text when linked email is unavailable", async () => {
    mockSpawn({ statusStdout: "Logged in as cli user" });
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("missing");
    });
    const probe = await probeCursorCli();
    expect(probe.ok).toBe(true);
    expect(probe.message).toContain("Logged in as cli user");
    readSpy.mockRestore();
  });

  it("reports unauthenticated cursor status", async () => {
    mockSpawn({ statusExitCode: 1, statusStdout: "", statusStderr: "Authentication required" });
    const result = await probeCursorCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Sign in with Cursor");
    expect(result.message).toContain("Authentication required");
  });

  it("reports cursor probe errors", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      createMockChild({ error: new Error("ENOENT"), args })
    );
    const result = await probeCursorCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Cursor agent not found");
  });

  it("reports non-zero cursor probe exits", async () => {
    mockSpawn({ statusExitCode: 0, statusStdout: "ok", exitCode: 2 });
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("status")) {
        return createMockChild({ stdout: "ok", args });
      }
      if (args.includes("--version")) {
        return createMockChild({ exitCode: 2, stderr: "not logged in", args });
      }
      return createMockChild({ args });
    });
    const result = await probeCursorCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not logged in");
  });

  it("extracts json result text and alternate fields", () => {
    expect(extractCursorAgentText('{"type":"result","result":"{\\"summary\\":\\"ok\\"}"}')).toContain("summary");
    expect(extractCursorAgentText('{"result":"{\\"summary\\":\\"ok\\"}"}')).toContain("summary");
    expect(extractCursorAgentText('{"text":"plain"}')).toBe("plain");
    expect(extractCursorAgentText('{"message":"msg"}')).toBe("msg");
    expect(extractCursorAgentText('{"content":"body"}')).toBe("body");
    expect(extractCursorAgentText("raw output")).toBe("raw output");
    expect(extractCursorAgentText("")).toBe("");
  });

  it("resolves cursor model selection against available models", async () => {
    const models = [
      { id: "auto", label: "auto" },
      { id: "gpt-test", label: "gpt-test" }
    ];

    await expect(resolveCursorCliModel("", models)).resolves.toEqual({
      cliModel: undefined,
      settingsModel: "auto",
      correctedFrom: undefined
    });

    await expect(resolveCursorCliModel("gpt-test", models)).resolves.toEqual({
      cliModel: "gpt-test",
      settingsModel: "gpt-test",
      correctedFrom: undefined
    });

    await expect(resolveCursorCliModel("missing-model", models)).resolves.toEqual({
      cliModel: undefined,
      settingsModel: "auto",
      correctedFrom: "missing-model"
    });
  });

  it("runs ask-mode completion", async () => {
    let prompt = "";
    mockSpawn({
      stdout: '{"type":"result","result":"{\\"text\\":\\"done\\"}"}',
      beforeClose: (args, input) => {
        prompt = input || "";
        expect(args).toContain("--mode");
        expect(args).toContain("ask");
        expect(args).toContain("--approve-mcps");
        expect(args.some((arg) => arg.includes("TASK INSTRUCTIONS"))).toBe(false);
      }
    });
    const text = await runCursorCliCompletion({
      system: "Return JSON only: {\"text\":\"string\"}",
      user: "RADAR CONTEXT"
    });
    expect(text).toContain("done");
    expect(prompt).toContain("TASK INSTRUCTIONS");
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(["--list-models"]);
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(["-p", "--output-format", "json", "--mode", "ask", "--trust", "--force", "--approve-mcps"])
    );
  });

  it("passes api key and explicit model flags", async () => {
    process.env.CURSOR_API_KEY = "cursor_test_key";
    mockSpawn({
      stdout: '{"type":"result","result":"{\\"ok\\":true}"}',
      listStdout: "auto\ngpt-test\n"
    });
    await runCursorCliCompletion({
      system: "system",
      user: "user",
      model: "gpt-test"
    });
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--api-key", "cursor_test_key", "--model", "gpt-test"]));
  });

  it("passes saved api key from settings", async () => {
    delete process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_AUTH_TOKEN;
    mockSpawn({
      stdout: '{"type":"result","result":"{\\"ok\\":true}"}',
      listStdout: "auto\ngpt-test\n"
    });
    await runCursorCliCompletion({
      system: "system",
      user: "user",
      apiKey: "saved-key"
    });
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--api-key", "saved-key"]));
  });

  it("uses auth token env when api key env is missing", async () => {
    delete process.env.CURSOR_API_KEY;
    process.env.CURSOR_AUTH_TOKEN = "cursor_auth_token";
    mockSpawn({
      stdout: '{"type":"result","result":"{\\"ok\\":true}"}',
      listStdout: "auto\ngpt-test\n"
    });
    await runCursorCliCompletion({
      system: "system",
      user: "user"
    });
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--api-key", "cursor_auth_token"]));
  });

  it("ignores unavailable cursor models at run time", async () => {
    mockSpawn({
      stdout: '{"type":"result","result":"{\\"ok\\":true}"}',
      listStdout: "auto\ngpt-5.3-codex\n",
      beforeClose: (args) => {
        expect(args).not.toContain("gpt-5.5-extra-high");
      }
    });

    await runCursorCliCompletion({
      system: "system",
      user: "user",
      model: "gpt-5.5-extra-high"
    });
  });

  it("passes explicit model and reports cursor failures", async () => {
    mockSpawn({ exitCode: 1, stderr: "auth failed", listStdout: "auto\ngpt-test\n" });
    await expect(
      runCursorCliCompletion({
        system: "system",
        user: "user",
        model: "gpt-test"
      })
    ).rejects.toThrow("auth failed");
    expect(spawnMock.mock.calls[1]?.[1]).toContain("gpt-test");
  });

  it("explains cursor retry-loop failures", async () => {
    mockSpawn({
      exitCode: 1,
      stderr: "Connection lost, reconnecting (attempt 3)... T: [internal] Failed to run step, exceeded max retries",
      listStdout: "auto\ngpt-test\n"
    });
    await expect(
      runCursorCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("could not keep its backend stream open");
  });

  it("caches cursor model listings", async () => {
    mockSpawn({ listStdout: "auto\n" });
    await listCursorCliModels();
    await listCursorCliModels();
    expect(spawnMock.mock.calls.filter((call) => call[1]?.includes("--list-models"))).toHaveLength(1);
  });

  it("uses saved api key when env is missing", async () => {
    delete process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_AUTH_TOKEN;
    mockSpawn({ stdout: '{"type":"result","result":"{\\"ok\\":true}"}' });
    await runCursorCliCompletion({
      system: "system",
      user: "user",
      apiKey: "saved-key"
    });
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--api-key", "saved-key"]));
  });

  it("lists cursor models from cli output", async () => {
    mockSpawn({ listStdout: "auto\ngpt-5\n" });
    await expect(listCursorCliModels()).resolves.toEqual([
      { id: "auto", label: "auto" },
      { id: "gpt-5", label: "gpt-5" }
    ]);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(["--list-models"]);
  });

  it("parses available models from failed cursor list output", async () => {
    mockSpawn({
      listExitCode: 1,
      listStderr: "Cannot use this model. Available models: auto, gpt-5.3-codex"
    });
    await expect(listCursorCliModels()).resolves.toEqual([
      { id: "auto", label: "auto" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
    ]);
  });

  it("returns auto when cursor model listing is empty", async () => {
    mockSpawn({ listStdout: "" });
    await expect(listCursorCliModels()).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });

  it("falls back to auto when cursor model listing fails", async () => {
    mockSpawn({ listExitCode: 1, listStderr: "not logged in" });
    await expect(listCursorCliModels()).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });

  it("rejects empty cursor responses", async () => {
    mockSpawn({ stdout: "" });
    await expect(
      runCursorCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("empty response");
  });

  it("reports cursor failures without detail", async () => {
    mockSpawn({ exitCode: null });
    await expect(
      runCursorCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("no exit code");
  });
});
