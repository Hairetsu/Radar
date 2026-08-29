import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

import {
  extractGrokCliText,
  listGrokCliModels,
  loginGrokCli,
  parseGrokModelOutput,
  probeGrokCli,
  readGrokAuthInfo,
  resetGrokCliModelCacheForTests,
  resolveGrokCliModel,
  resolveGrokCliPath,
  runGrokCliCompletion
} from "./grokCli.js";

type MockSpawnOptions = {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: unknown;
  beforeClose?: (args: string[]) => void;
  modelsExitCode?: number | null;
  modelsStdout?: string;
  modelsStderr?: string;
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
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  Promise.resolve().then(() => {
    beforeClose?.(args);
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
  modelsExitCode = 0,
  modelsStdout = "You are logged in with grok.com.\n\nDefault model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n",
  modelsStderr = ""
}: MockSpawnOptions = {}) {
  spawnMock.mockImplementation((_command: string, args: string[]) => {
    if (args[0] === "models") {
      return createMockChild({
        exitCode: modelsExitCode,
        stdout: modelsStdout,
        stderr: modelsStderr,
        args
      });
    }
    if (args.includes("--version")) {
      return createMockChild({ stdout: "grok 1.0.5\n", args });
    }
    return createMockChild({ exitCode, stdout, stderr, error, beforeClose, args });
  });
}

describe("grokCli", () => {
  const env = { ...process.env };
  let tmpDir = "";

  beforeEach(() => {
    process.env = { ...env };
    spawnMock.mockReset();
    resetGrokCliModelCacheForTests();
  });

  afterEach(() => {
    process.env = env;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("resolves explicit executable path from env", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-grok-test-"));
    const executable = path.join(tmpDir, "grok");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.GROK_CLI_PATH = executable;
    expect(resolveGrokCliPath()).toBe(executable);
  });

  it("falls through missing env paths and accepts command names", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-grok-test-"));
    const executable = path.join(tmpDir, "grok-real");
    fs.writeFileSync(executable, "#!/bin/sh\n", { mode: 0o700 });
    process.env.GROK_CLI_PATH = path.join(tmpDir, "missing");
    process.env.GROK_CLI_BIN = executable;
    expect(resolveGrokCliPath()).toBe(executable);

    process.env.GROK_CLI_PATH = "grok";
    expect(resolveGrokCliPath()).toBe("grok");
  });

  it("parses grok models list output", () => {
    expect(
      parseGrokModelOutput(
        "You are logged in with grok.com.\n\nDefault model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n"
      )
    ).toEqual([
      { id: "auto", label: "auto" },
      { id: "grok-4.6", label: "grok-4.6" },
      { id: "grok-4.5", label: "grok-4.5" }
    ]);
  });

  it("parses grok json model arrays", () => {
    expect(parseGrokModelOutput('[{"id":"grok-4.6","name":"Grok 4.6"}]')).toEqual([
      { id: "grok-4.6", label: "Grok 4.6" }
    ]);
  });

  it("keeps auto when grok already lists it", () => {
    expect(parseGrokModelOutput("  * auto\n  - grok-4.6\n")).toEqual([
      { id: "auto", label: "auto" },
      { id: "grok-4.6", label: "grok-4.6" }
    ]);
  });

  it("probes installed grok cli", async () => {
    mockSpawn();
    const probe = await probeGrokCli();
    expect(probe.ok).toBe(true);
    expect(probe.message).toContain("grok 1.0.5");
    expect(spawnMock.mock.calls.some((call) => call[1]?.includes("--version"))).toBe(true);
    expect(spawnMock.mock.calls.some((call) => call[1]?.[0] === "models")).toBe(true);
  });

  it("reads linked grok account info", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        "https://auth.x.ai::abc": { email: "tester@example.com" }
      })
    );
    expect(readGrokAuthInfo()).toEqual({ email: "tester@example.com" });
    readSpy.mockRestore();
  });

  it("returns null when grok auth info is missing", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("missing");
    });
    expect(readGrokAuthInfo()).toBeNull();
    readSpy.mockRestore();
  });

  it("returns null when grok auth email is blank", () => {
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ "https://auth.x.ai::abc": { email: "  " } })
    );
    expect(readGrokAuthInfo()).toBeNull();
    readSpy.mockRestore();
  });

  it("includes linked account in probe message", async () => {
    mockSpawn();
    const readSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ "https://auth.x.ai::abc": { email: "linked@example.com" } })
    );
    const probe = await probeGrokCli();
    expect(probe.ok).toBe(true);
    expect(probe.message).toContain("linked@example.com");
    readSpy.mockRestore();
  });

  it("reports unauthenticated grok status", async () => {
    mockSpawn({ modelsExitCode: 1, modelsStdout: "", modelsStderr: "Authentication required" });
    const result = await probeGrokCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Sign in with Grok");
    expect(result.message).toContain("Authentication required");
  });

  it("reports grok probe errors", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      createMockChild({ error: new Error("ENOENT"), args })
    );
    const result = await probeGrokCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Grok CLI not found");
  });

  it("reports unknown grok probe errors", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      createMockChild({ error: "bad", args })
    );
    const result = await probeGrokCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("unknown error");
  });

  it("reports non-zero grok version exits", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("--version")) {
        return createMockChild({ exitCode: 2, stderr: "not logged in", args });
      }
      return createMockChild({ args });
    });
    const result = await probeGrokCli();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not logged in");
  });

  it("runs grok browser login", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ stdout: "Logged in\n", args });
      }
      if (args[0] === "models") {
        return createMockChild({ stdout: "You are logged in with grok.com.\n", args });
      }
      if (args.includes("--version")) {
        return createMockChild({ stdout: "grok 1.0.5\n", args });
      }
      return createMockChild({ args });
    });
    const probe = await loginGrokCli();
    expect(probe.ok).toBe(true);
    expect(spawnMock.mock.calls.some((call) => call[1]?.includes("login"))).toBe(true);
  });

  it("reports grok login failure", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ exitCode: 1, stderr: "login cancelled\n", args });
      }
      return createMockChild({ args });
    });
    const probe = await loginGrokCli();
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("login cancelled");
  });

  it("reports grok login spawn error", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args.includes("login")) {
        return createMockChild({ error: new Error("spawn failed"), args });
      }
      return createMockChild({ args });
    });
    const probe = await loginGrokCli();
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("spawn failed");
  });

  it("extracts json result text and error objects", () => {
    expect(extractGrokCliText('{"text":"{\\"summary\\":\\"ok\\"}"}')).toContain("summary");
    expect(extractGrokCliText('{"result":"plain"}')).toBe("plain");
    expect(extractGrokCliText('{"message":"msg"}')).toBe("msg");
    expect(extractGrokCliText('{"content":"body"}')).toBe("body");
    expect(extractGrokCliText("raw output")).toBe("raw output");
    expect(extractGrokCliText("")).toBe("");
    expect(extractGrokCliText('{"ok":true}')).toBe('{"ok":true}');
    expect(() => extractGrokCliText('{"type":"error","message":"auth failed"}')).toThrow("auth failed");
    expect(() => extractGrokCliText('{"type":"error"}')).toThrow("Grok CLI returned an error.");
    expect(extractGrokCliText('{"type":"error","message":"max turns reached","text":"{\\"summary\\":\\"partial\\"}"}')).toContain(
      "summary"
    );
  });

  it("resolves grok model selection against available models", async () => {
    const models = [
      { id: "auto", label: "auto" },
      { id: "grok-4.6", label: "grok-4.6" }
    ];

    await expect(resolveGrokCliModel("", models)).resolves.toEqual({
      cliModel: undefined,
      settingsModel: "auto",
      correctedFrom: undefined
    });

    await expect(resolveGrokCliModel("grok-4.6", models)).resolves.toEqual({
      cliModel: "grok-4.6",
      settingsModel: "grok-4.6",
      correctedFrom: undefined
    });

    await expect(resolveGrokCliModel("missing-model", models)).resolves.toEqual({
      cliModel: undefined,
      settingsModel: "auto",
      correctedFrom: "missing-model"
    });
  });

  it("runs headless grok completion from a prompt file", async () => {
    mockSpawn({
      stdout: '{"text":"{\\"summary\\":\\"ok\\"}"}',
      beforeClose: (args) => {
        expect(args).toContain("--prompt-file");
        expect(args).toContain("--output-format");
        expect(args).toContain("json");
        expect(args).toContain("--sandbox");
        expect(args).toContain("read-only");
        expect(args).toContain("--max-turns");
        expect(args[args.indexOf("--max-turns") + 1]).toBe("4");
        expect(args).toContain("--tools");
        expect(args[args.indexOf("--tools") + 1]).toBe("");
        expect(args).toContain("--json-schema");
        expect(args).toContain("--verbatim");
        const promptFile = args[args.indexOf("--prompt-file") + 1];
        const prompt = fs.readFileSync(promptFile, "utf8");
        expect(prompt).toContain("TASK INSTRUCTIONS");
        expect(prompt).toContain("system text");
        expect(prompt).toContain("user text");
      }
    });

    const text = await runGrokCliCompletion({
      system: "system text",
      user: "user text",
      model: "auto"
    });

    expect(text).toContain('"summary":"ok"');
    const completionArgs = spawnMock.mock.calls.find((call) => call[1]?.includes("--prompt-file"))?.[1] as string[];
    expect(completionArgs).not.toContain("--model");
  });

  it("passes explicit model and XAI_API_KEY through the grok process env", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    mockSpawn({
      stdout: '{"text":"{\\"ok\\":true}"}',
      modelsStdout: "  * grok-4.6\n  - grok-4.5\n"
    });
    await runGrokCliCompletion({
      system: "system",
      user: "user",
      model: "grok-4.6"
    });
    const completionCall = spawnMock.mock.calls.find((call) => call[1]?.includes("--prompt-file"));
    expect(completionCall?.[1]).toEqual(expect.arrayContaining(["--model", "grok-4.6"]));
    expect(completionCall?.[2].env.XAI_API_KEY).toBe("xai-test-key");
  });

  it("passes saved api key from settings when env is missing", async () => {
    delete process.env.XAI_API_KEY;
    mockSpawn({ stdout: '{"text":"{\\"ok\\":true}"}' });
    await runGrokCliCompletion({
      system: "system",
      user: "user",
      apiKey: "saved-key"
    });
    const completionCall = spawnMock.mock.calls.find((call) => call[1]?.includes("--prompt-file"));
    expect(completionCall?.[2].env.XAI_API_KEY).toBe("saved-key");
  });

  it("ignores unavailable grok models at run time", async () => {
    mockSpawn({
      stdout: '{"text":"{\\"ok\\":true}"}',
      beforeClose: (args) => {
        expect(args).not.toContain("missing-model");
      }
    });

    await runGrokCliCompletion({
      system: "system",
      user: "user",
      model: "missing-model"
    });
  });

  it("reports grok completion failures", async () => {
    mockSpawn({
      exitCode: 1,
      stderr: "auth failed",
      modelsStdout: "  * grok-4.6\n"
    });
    await expect(
      runGrokCliCompletion({
        system: "system",
        user: "user",
        model: "grok-4.6"
      })
    ).rejects.toThrow("auth failed");
  });

  it("explains grok max-turns failures", async () => {
    mockSpawn({
      exitCode: 1,
      stderr: "Error: max turns reached",
      modelsStdout: "  * grok-4.6\n"
    });
    await expect(
      runGrokCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("turn budget");
  });

  it("uses grok answer text even when the process exits after max turns", async () => {
    mockSpawn({
      exitCode: 1,
      stdout: '{"text":"{\\"summary\\":\\"ok\\"}"}',
      stderr: "Error: max turns reached",
      modelsStdout: "  * grok-4.6\n"
    });
    await expect(
      runGrokCliCompletion({
        system: "system",
        user: "user"
      })
    ).resolves.toContain('"summary":"ok"');
  });

  it("turns a missing executable during completion into recovery guidance", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "models") {
        return createMockChild({ stdout: "  * grok-4.6\n", args });
      }
      return createMockChild({ error: new Error("spawn grok ENOENT"), args });
    });

    await expect(
      runGrokCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("Install Grok Build CLI or set GROK_CLI_PATH");
  });

  it("rejects empty grok responses", async () => {
    mockSpawn();
    await expect(
      runGrokCliCompletion({
        system: "system",
        user: "user"
      })
    ).rejects.toThrow("empty response");
  });

  it("lists grok models from cli output", async () => {
    mockSpawn();
    await expect(listGrokCliModels()).resolves.toEqual([
      { id: "auto", label: "auto" },
      { id: "grok-4.6", label: "grok-4.6" },
      { id: "grok-4.5", label: "grok-4.5" }
    ]);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(["models"]);
  });

  it("caches grok model listings", async () => {
    mockSpawn();
    await listGrokCliModels();
    await listGrokCliModels();
    expect(spawnMock.mock.calls.filter((call) => call[1]?.[0] === "models")).toHaveLength(1);
  });

  it("falls back to auto when grok model listing fails", async () => {
    mockSpawn({ modelsExitCode: 1, modelsStdout: "", modelsStderr: "unknown command" });
    await expect(listGrokCliModels()).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });
});
