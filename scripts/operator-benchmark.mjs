#!/usr/bin/env node
/* global Buffer, URL, fetch, setTimeout, window */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";
import { HttpProxyAgent } from "http-proxy-agent";
import {
  HARBORLINE_BENCHMARK_TARGET,
  OPERATOR_BENCHMARK_CASES,
  buildOperatorBenchmarkMatrix,
  evaluateOperatorBenchmarkRun,
  expectedOperatorBenchmarkDisposition,
  getOperatorBenchmarkCase
} from "../dist-electron/shared/operatorBenchmark.js";
import { AGENT_RUN_PROFILES } from "../dist-electron/shared/agentProfiles.js";
import { completionReportForRun } from "../dist-electron/shared/agentReport.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TIMEOUT_MS = 11 * 60_000;
const PROVIDERS = new Set([
  "openai",
  "anthropic",
  "xai",
  "openrouter",
  "openai-compatible",
  "codex-local",
  "cursor-local"
]);
const PROVIDER_KEY_ENV = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "openai-compatible": "RADAR_BENCHMARK_API_KEY",
  "cursor-local": "CURSOR_API_KEY"
};

function usage() {
  return `Radar Operator benchmark

Usage:
  pnpm benchmark:operator -- --list
  pnpm benchmark:operator -- --dry-run --models MODEL[,MODEL]
  pnpm benchmark:operator -- --models MODEL[,MODEL] [options]

Options:
  --suite smoke|core|full       Case suite (default: core)
  --cases ID[,ID]               Override the suite with exact case ids
  --profiles recommended|all|ID[,ID]
                                 Recommended profile per case (default), or a cross-profile matrix
  --provider PROVIDER           Radar AI provider (default: RADAR_BENCHMARK_PROVIDER or openai)
  --models MODEL[,MODEL]        Models to run (or RADAR_BENCHMARK_MODELS)
  --base-url URL                Required for openai-compatible providers
  --api-key-env NAME            Read the provider key from this environment variable
  --approve-active              Approve visible, bounded, non-destructive localhost capability leases
  --artifacts PATH              Report directory (default: artifacts/operator-benchmark/<timestamp>)
  --timeout-ms NUMBER           Per-run timeout, clamped to 10 seconds through 11 minutes
  --dry-run                     Print the matrix and expectations without launching Radar
  --list                        List prompts and expected outcomes without launching Radar
  --help                        Show this message

The runner only targets ${HARBORLINE_BENCHMARK_TARGET}. It refuses a different service on port 3000,
never prints API keys, runs entries sequentially, and does not approve active leases unless
--approve-active is present.`;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    suite: "core",
    cases: undefined,
    profiles: "recommended",
    provider: process.env.RADAR_BENCHMARK_PROVIDER?.trim() || "openai",
    models: process.env.RADAR_BENCHMARK_MODELS?.trim() || "",
    baseUrl: process.env.RADAR_BENCHMARK_BASE_URL?.trim() || "",
    apiKeyEnv: "",
    approveActive: false,
    artifacts: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
    list: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--list") options.list = true;
    else if (argument === "--approve-active") options.approveActive = true;
    else if (argument === "--suite") options.suite = optionValue(argv, index++, argument);
    else if (argument === "--cases") options.cases = optionValue(argv, index++, argument);
    else if (argument === "--profiles") options.profiles = optionValue(argv, index++, argument);
    else if (argument === "--provider") options.provider = optionValue(argv, index++, argument);
    else if (argument === "--models") options.models = optionValue(argv, index++, argument);
    else if (argument === "--base-url") options.baseUrl = optionValue(argv, index++, argument);
    else if (argument === "--api-key-env") options.apiKeyEnv = optionValue(argv, index++, argument);
    else if (argument === "--artifacts") options.artifacts = optionValue(argv, index++, argument);
    else if (argument === "--timeout-ms") options.timeoutMs = Number(optionValue(argv, index++, argument));
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (!new Set(["smoke", "core", "full"]).has(options.suite)) {
    throw new Error(`Unknown suite: ${options.suite}`);
  }
  if (!PROVIDERS.has(options.provider)) {
    throw new Error(`Unknown provider: ${options.provider}`);
  }
  if (!Number.isFinite(options.timeoutMs)) {
    throw new Error("--timeout-ms must be a finite number.");
  }
  options.timeoutMs = Math.min(DEFAULT_TIMEOUT_MS, Math.max(10_000, Math.round(options.timeoutMs)));
  return options;
}

function commaValues(value) {
  return [...new Set(String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function selectedCases(options) {
  if (options.cases) {
    return commaValues(options.cases).map(getOperatorBenchmarkCase);
  }
  return OPERATOR_BENCHMARK_CASES.filter((benchmarkCase) => benchmarkCase.suites.includes(options.suite));
}

function selectedProfiles(value) {
  if (value === "recommended") return undefined;
  if (value === "all") return AGENT_RUN_PROFILES.map((profile) => profile.id);
  const ids = commaValues(value);
  if (ids.length === 0) throw new Error("--profiles requires recommended, all, or at least one profile id.");
  return ids;
}

function selectedModels(options) {
  const models = commaValues(options.models);
  if (models.length === 0 && !options.list) {
    throw new Error("Provide --models or RADAR_BENCHMARK_MODELS.");
  }
  return models;
}

function printCatalog(cases) {
  for (const benchmarkCase of cases) {
    process.stdout.write(`\n${benchmarkCase.id} [${benchmarkCase.recommendedProfileId}]\n`);
    process.stdout.write(`Prompt: ${benchmarkCase.prompt}\n`);
    process.stdout.write(`Expected: ${benchmarkCase.expected.summary}\n`);
    process.stdout.write(`Evidence threshold: ${benchmarkCase.expected.minimumSignalCount} signal(s), ${benchmarkCase.expected.minimumEvidenceRefs} reference(s)\n`);
    if (benchmarkCase.expected.acceptedGaps.length > 0) {
      process.stdout.write(`Accepted gaps: ${benchmarkCase.expected.acceptedGaps.join(" ")}\n`);
    }
  }
}

function printMatrix(matrix, provider) {
  process.stdout.write(`\nProvider: ${provider}\n${matrix.length} benchmark run(s)\n`);
  for (const entry of matrix) {
    const benchmarkCase = getOperatorBenchmarkCase(entry.caseId);
    const disposition = expectedOperatorBenchmarkDisposition(benchmarkCase, entry.profileId);
    process.stdout.write(`${entry.model} | ${entry.profileId} | ${entry.caseId} | expected ${disposition.kind}\n`);
  }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port."));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function targetIdentity() {
  try {
    const response = await fetch(HARBORLINE_BENCHMARK_TARGET, { redirect: "error" });
    const body = await response.text();
    return response.ok && /HARBORLINE|Harborline/.test(body);
  } catch {
    return false;
  }
}

async function portIsOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function ensureHarborline() {
  if (await targetIdentity()) {
    return { process: null, started: false };
  }
  if (await portIsOpen(3000)) {
    throw new Error("Port 3000 is occupied by a service that does not identify as Harborline. The benchmark refused to continue.");
  }

  const demoProcess = spawn("pnpm", ["demo:dev"], {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const retainOutput = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4_000);
  };
  demoProcess.stdout?.on("data", retainOutput);
  demoProcess.stderr?.on("data", retainOutput);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await targetIdentity()) return { process: demoProcess, started: true };
    if (demoProcess.exitCode !== null) {
      throw new Error(`Harborline exited before it became ready.\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  demoProcess.kill("SIGTERM");
  throw new Error(`Harborline did not become ready within 30 seconds.\n${output}`);
}

function baselineRequest(agent, requestPath, init = {}) {
  const target = new URL(requestPath, HARBORLINE_BENCHMARK_TARGET);
  const body = init.body || "";
  return new Promise((resolve, reject) => {
    const request = http.request(target, {
      method: init.method || "GET",
      agent,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(init.headers || {})
      }
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode || 0));
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function seedBaselineTraffic(proxyPort) {
  const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);
  const requests = [
    baselineRequest(agent, "/api/ops/summary"),
    baselineRequest(agent, "/api/cargo/search?q=Orion"),
    baselineRequest(agent, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "operator", password: "harbor-2026" })
    }),
    baselineRequest(agent, "/api/billing/invoices/INV-1007"),
    baselineRequest(agent, "/api/files/read?path=quarterly%2Fmanifest.txt"),
    baselineRequest(agent, "/api/integrations/preview", {
      method: "POST",
      body: JSON.stringify({ url: "https://status.example.test/feed" })
    }),
    baselineRequest(agent, "/api/operators/profile", {
      method: "POST",
      body: JSON.stringify({ displayName: "Mira Chen", jobTitle: "Dispatch coordinator" })
    }),
    baselineRequest(agent, "/api/support/preview?message=Container%20arrived%20with%20a%20broken%20seal."),
    baselineRequest(agent, "/api/cargo/search", {
      method: "OPTIONS",
      headers: { Origin: HARBORLINE_BENCHMARK_TARGET }
    })
  ];
  const statuses = await Promise.all(requests);
  if (statuses.some((status) => status === 0 || status >= 500)) {
    throw new Error(`Baseline traffic failed with status sequence ${statuses.join(", ")}.`);
  }
}

async function openOperator(page) {
  const context = page.context();
  let operator = context.pages().find((candidate) => candidate.url().includes("surface=ai-operator"));
  if (!operator) {
    const opened = context.waitForEvent("page");
    await page.getByTestId("openAiSettings").click();
    operator = await opened;
  }
  await operator.getByTestId("aiOperatorShell").waitFor({ timeout: 30_000 });
  return operator;
}

function providerSettings(options, model) {
  const keyEnvironment = options.apiKeyEnv || PROVIDER_KEY_ENV[options.provider] || "";
  const apiKey = keyEnvironment ? process.env[keyEnvironment]?.trim() || "" : "";
  if (!new Set(["codex-local", "cursor-local", "openai-compatible"]).has(options.provider) && !apiKey) {
    throw new Error(`Provider ${options.provider} requires ${keyEnvironment || "an API key environment variable"}.`);
  }
  if (options.provider === "openai-compatible" && !options.baseUrl) {
    throw new Error("--base-url or RADAR_BENCHMARK_BASE_URL is required for openai-compatible runs.");
  }
  return {
    provider: options.provider,
    model,
    apiKey: options.provider === "codex-local" ? "local" : apiKey || "local",
    baseUrl: options.baseUrl
  };
}

async function configureProvider(operator, settings) {
  const result = await operator.evaluate(async (configuration) => {
    const api = window.radarOperator;
    if (!api) throw new Error("Radar Operator API is unavailable.");
    const current = await api.getAiSettings(configuration.provider);
    const saved = await api.setAiSettings({
      ...current,
      provider: configuration.provider,
      model: configuration.model,
      apiKey: configuration.apiKey,
      ...(configuration.baseUrl ? { baseUrl: configuration.baseUrl } : {})
    });
    const probe = await api.probeAiConnection(saved);
    return { saved: { provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl }, probe };
  }, settings);
  if (!result.probe.ok) {
    throw new Error(`Radar could not connect to ${result.saved.provider}/${result.saved.model}: ${result.probe.message}`);
  }
  await operator.reload();
  await operator.getByTestId("aiOperatorShell").waitFor({ timeout: 30_000 });
  return result.saved;
}

function safeLease(run) {
  const lease = run.capabilities?.leases.find((candidate) => candidate.status === "draft");
  if (!lease) return { ok: false, reason: "No draft lease was present." };
  if (lease.riskTier === "destructive") return { ok: false, reason: "Destructive leases are never benchmark-approved." };
  if (lease.grants.some((grant) => grant.origin !== HARBORLINE_BENCHMARK_TARGET)) {
    return { ok: false, reason: "A lease grant was not bound to the exact Harborline origin." };
  }
  if (lease.grants.some((grant) => grant.method.toUpperCase() === "DELETE")) {
    return { ok: false, reason: "DELETE grants are never benchmark-approved." };
  }
  return { ok: true, lease };
}

async function approveVisibleLease(operator, run) {
  const safety = safeLease(run);
  if (!safety.ok) return safety;
  await operator.bringToFront();
  const permission = operator.getByTestId("agentCapabilityReview");
  if (!await permission.isVisible().catch(() => false)) {
    await operator.reload();
    await operator.getByTestId("aiOperatorShell").waitFor({ timeout: 30_000 });
  }
  await permission.waitFor({ state: "visible", timeout: 15_000 });
  const grantAll = operator.getByTestId("capabilityPermissionGrantAll");
  if (await grantAll.isVisible().catch(() => false)) await grantAll.click();
  else await operator.getByTestId("capabilityPermissionGrant").click();
  await permission.waitFor({ state: "detached", timeout: 15_000 });
  return { ok: true, lease: safety.lease };
}

async function waitForRun(operator, runId, options) {
  const startedAt = Date.now();
  let approvals = 0;
  let lastRun = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    lastRun = await operator.evaluate(async (id) => window.radarOperator?.getAgentRun(id), runId);
    if (!lastRun) throw new Error(`Radar lost benchmark run ${runId}.`);
    if (new Set(["completed", "failed", "stopped"]).has(lastRun.status)) return lastRun;
    if (lastRun.status === "paused") {
      const draftLease = lastRun.capabilities?.leases.some((lease) => lease.status === "draft");
      if (!draftLease || !options.approveActive) return lastRun;
      if (approvals >= 50) throw new Error("The benchmark refused more than 50 capability approvals in one run.");
      const approval = await approveVisibleLease(operator, lastRun);
      if (!approval.ok) return lastRun;
      approvals += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (lastRun && !new Set(["completed", "failed", "stopped"]).has(lastRun.status)) {
    await operator.evaluate(async (id) => window.radarOperator?.stopAgentRun(id), runId).catch(() => undefined);
  }
  throw new Error(`Radar run ${runId} exceeded the benchmark timeout of ${options.timeoutMs}ms.`);
}

function sanitizedTimeline(run) {
  return run.timeline.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    phase: entry.phase,
    summary: entry.summary,
    note: entry.note,
    tool: entry.toolResult?.tool || entry.toolCall?.tool,
    ok: entry.toolResult?.ok,
    evidenceId: entry.target?.evidenceId
  }));
}

async function removeIsolatedUserData(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt === 19) {
        process.stderr.write(`Warning: isolated benchmark data could not be removed from ${directory}: ${error instanceof Error ? error.message : String(error)}\n`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function runEntry(entry, options, index, total) {
  const benchmarkCase = getOperatorBenchmarkCase(entry.caseId);
  const expectedDisposition = expectedOperatorBenchmarkDisposition(benchmarkCase, entry.profileId);
  const userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-operator-benchmark-"));
  const proxyPort = await freePort();
  const debugPort = await freePort();
  const startedAt = new Date();
  let application;
  process.stdout.write(`[${index + 1}/${total}] ${entry.model} | ${entry.profileId} | ${entry.caseId}\n`);

  try {
    application = await electron.launch({
      args: [path.join(REPOSITORY_ROOT, "dist-electron", "electron", "main.js")],
      env: {
        ...process.env,
        RADAR_REGRESSION_USER_DATA_DIR: userDataDirectory,
        RADAR_REGRESSION_ARTIFACT_DIR: path.join(userDataDirectory, "benchmark-artifacts"),
        RADAR_REGRESSION_PROXY_PORT: String(proxyPort),
        RADAR_REGRESSION_DEBUG_PORT: String(debugPort)
      },
      timeout: 30_000
    });
    const page = await application.firstWindow();
    await page.getByTestId("radarShell").waitFor({ timeout: 30_000 });
    await page.evaluate(async ({ target, name }) => {
      if (!window.radar) throw new Error("Radar workspace API is unavailable.");
      await window.radar.createLocalSession(name);
      await window.radar.setTargets([target]);
      await window.radar.startProxy();
    }, { target: HARBORLINE_BENCHMARK_TARGET, name: `Benchmark ${entry.caseId}` });
    await seedBaselineTraffic(proxyPort);
    await page.waitForFunction(async () => (await window.radar?.getCaptures() || []).length >= 9, undefined, { timeout: 30_000 });

    const operator = await openOperator(page);
    const configured = await configureProvider(operator, providerSettings(options, entry.model));
    const run = await operator.evaluate(async ({ goal, profileId, startUrl }) => {
      if (!window.radarOperator) throw new Error("Radar Operator API is unavailable.");
      return await window.radarOperator.startAgentRun({ goal, profileId, startUrl });
    }, {
      goal: benchmarkCase.prompt,
      profileId: entry.profileId,
      startUrl: HARBORLINE_BENCHMARK_TARGET
    });
    const completed = await waitForRun(operator, run.id, options);
    const evaluation = evaluateOperatorBenchmarkRun(benchmarkCase, entry.profileId, completed);
    const finishedAt = new Date();
    return {
      ok: true,
      id: entry.id,
      model: entry.model,
      provider: configured.provider,
      profileId: entry.profileId,
      caseId: entry.caseId,
      expectedDisposition,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      run: {
        id: completed.id,
        status: completed.status,
        error: completed.error,
        policy: completed.policy,
        checkpoint: completed.checkpoint,
        findings: completed.findings,
        completionReport: completionReportForRun(completed),
        timeline: sanitizedTimeline(completed)
      },
      evaluation
    };
  } catch (error) {
    const finishedAt = new Date();
    return {
      ok: false,
      id: entry.id,
      model: entry.model,
      provider: options.provider,
      profileId: entry.profileId,
      caseId: entry.caseId,
      expectedDisposition,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (application) {
      await Promise.all(application.windows().map((page) =>
        page.evaluate(() => window.radar?.stopProxy()).catch(() => undefined)
      ));
      await application.close().catch(() => undefined);
    }
    await removeIsolatedUserData(userDataDirectory);
  }
}

function markdownReport(report) {
  const passed = report.results.filter((result) => result.ok && new Set(["verified", "policy-limited"]).has(result.evaluation.outcome)).length;
  const lines = [
    "# Radar Operator benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target}`,
    `Provider: ${report.provider}`,
    `Active capability approval: ${report.approveActive ? "explicitly enabled" : "disabled"}`,
    `Expected outcomes met: ${passed}/${report.results.length}`,
    "",
    "| Model | Profile | Case | Expected | Run | Outcome | Score |",
    "| --- | --- | --- | --- | --- | --- | ---: |"
  ];
  for (const result of report.results) {
    lines.push(result.ok
      ? `| ${result.model} | ${result.profileId} | ${result.caseId} | ${result.expectedDisposition.kind} | ${result.run.status} | ${result.evaluation.outcome} | ${result.evaluation.score} |`
      : `| ${result.model} | ${result.profileId} | ${result.caseId} | ${result.expectedDisposition.kind} | runner error | error | 0 |`);
  }
  lines.push("", "## Case details", "");
  for (const result of report.results) {
    const benchmarkCase = getOperatorBenchmarkCase(result.caseId);
    lines.push(`### ${result.model} · ${result.profileId} · ${benchmarkCase.title}`, "");
    lines.push(`Expected: ${benchmarkCase.expected.summary}`, "");
    lines.push(`Profile expectation: ${result.expectedDisposition.kind}. ${result.expectedDisposition.explanation}`, "");
    if (!result.ok) {
      lines.push(`Runner error: ${result.error}`, "");
      continue;
    }
    lines.push(`Observed outcome: ${result.evaluation.outcome} (${result.evaluation.score}/100)`, "");
    lines.push(`Observed signals: ${result.evaluation.observedSignals.join(", ") || "none"}`, "");
    lines.push(`Missing signals: ${result.evaluation.missingSignals.join(", ") || "none"}`, "");
    lines.push(`Evidence references: ${result.evaluation.evidenceRefs.join(", ") || "none"}`, "");
    lines.push(`Tools: ${result.evaluation.usedTools.join(", ") || "none"}`, "");
  }
  return `${lines.join("\n")}\n`;
}

function artifactDirectory(options) {
  if (options.artifacts) return path.resolve(REPOSITORY_ROOT, options.artifacts);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return path.join(REPOSITORY_ROOT, "artifacts", "operator-benchmark", timestamp);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const cases = selectedCases(options);
  if (options.list) {
    printCatalog(cases);
    return;
  }
  const models = selectedModels(options);
  const matrix = buildOperatorBenchmarkMatrix({
    models,
    caseIds: cases.map((benchmarkCase) => benchmarkCase.id),
    profileIds: selectedProfiles(options.profiles)
  });
  printMatrix(matrix, options.provider);
  if (options.dryRun) return;

  providerSettings(options, models[0]);
  const harborline = await ensureHarborline();
  const results = [];
  try {
    for (let index = 0; index < matrix.length; index += 1) {
      results.push(await runEntry(matrix[index], options, index, matrix.length));
    }
  } finally {
    if (harborline.started && harborline.process) {
      harborline.process.kill("SIGTERM");
    }
  }

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    target: HARBORLINE_BENCHMARK_TARGET,
    provider: options.provider,
    suite: options.cases ? "custom" : options.suite,
    approveActive: options.approveActive,
    matrix,
    cases: cases.map((benchmarkCase) => ({
      id: benchmarkCase.id,
      title: benchmarkCase.title,
      prompt: benchmarkCase.prompt,
      expected: benchmarkCase.expected
    })),
    results
  };
  const directory = artifactDirectory(options);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(directory, "report.md"), markdownReport(report), { mode: 0o600 });
  process.stdout.write(`\nReport: ${path.join(directory, "report.md")}\n`);
  process.stdout.write(`Data: ${path.join(directory, "report.json")}\n`);

  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
