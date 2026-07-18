import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { WebSocketServer, type WebSocket } from "ws";
import WebSocketClient from "ws";

export type LabRequest = {
  id: number;
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  receivedAt: string;
};

export type TargetLab = {
  origin: string;
  socketUrl: string;
  requests: LabRequest[];
  socketMessages: string[];
  reset: () => void;
  waitForRequests: (count: number, timeoutMs?: number) => Promise<LabRequest[]>;
  close: () => Promise<void>;
};

export type HttpsTargetLab = {
  origin: string;
  requests: LabRequest[];
  certificate: string;
  close: () => Promise<void>;
};

function normalizedHeaders(headers: http.IncomingHttpHeaders) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value || ""])
  );
}

function readBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

async function route(request: http.IncomingMessage, response: http.ServerResponse, labRequest: LabRequest) {
  const url = new URL(labRequest.url);
  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "radar-regression-provider" });
    return;
  }
  if (url.pathname === "/v1/models") {
    sendJson(response, 200, { data: [{ id: "radar-fixture-model" }] });
    return;
  }
  if (url.pathname === "/v1/chat/completions") {
    const input = JSON.parse(labRequest.body || "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const system = input.messages?.find((message) => message.role === "system")?.content || "";
    const user = input.messages?.find((message) => message.role === "user")?.content || "";
    if (user.includes("fixture:http-error")) {
      sendJson(response, 503, { error: "Scripted provider failure" });
      return;
    }
    if (user.includes("fixture:timeout")) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    const isPlanner = system.includes("autonomous defensive web security agent");
    const plannerContext = (() => {
      if (!isPlanner) return null;
      try {
        return JSON.parse(user) as {
          goal?: string;
          targetOrigin?: string;
          timeline?: Array<{
            note?: string;
            toolCall?: { tool?: string };
            toolResult?: { tool?: string; ok?: boolean; data?: Record<string, unknown> };
          }>;
        };
      } catch {
        return null;
      }
    })();
    const goal = plannerContext?.goal || user;
    const timeline = plannerContext?.timeline || [];
    const resultFor = (tool: string) => [...timeline].reverse().find((entry) => entry.toolResult?.tool === tool)?.toolResult;
    if (isPlanner && goal.includes("fixture:planner-delay")) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (isPlanner && goal.includes("fixture:runtime-budget")) {
      await new Promise((resolve) => setTimeout(resolve, 10_500));
    }
    const workflowCaptureId = goal.match(/capture-id:([^\s]+)/)?.[1] || "";
    const content = user.includes("fixture:malformed")
      ? "not-json"
      : isPlanner && goal.includes("fixture:browser-tool-failure") && timeline.some((entry) => entry.note?.includes("Skipped failed step"))
        ? JSON.stringify({ action: "finish", rationale: "Operator skipped the unavailable browser observation.", findings: [] })
      : isPlanner && goal.includes("fixture:browser-tool-failure")
        ? JSON.stringify({ action: "tool", tool: "getPageText", input: {}, rationale: "Exercise deterministic recovery controls." })
      : isPlanner && goal.includes("fixture:memory-proposal") && resultFor("proposeRunMemory")
        ? JSON.stringify({ action: "finish", rationale: "Memory proposal prepared for operator review.", findings: [] })
      : isPlanner && goal.includes("fixture:memory-proposal")
        ? JSON.stringify({
            action: "tool",
            tool: "proposeRunMemory",
            input: { kind: "hypothesis", title: "Fixture proposed memory", notes: "Confirm or dismiss this deterministic run memory.", evidenceRefs: [] },
            rationale: "Offer a reviewable memory proposal."
          })
      : isPlanner && goal.includes("fixture:prepare-workflow") && resultFor("prepareWorkflowDraft")
        ? JSON.stringify({ action: "finish", rationale: "Workflow draft is visible for operator review.", findings: [] })
      : isPlanner && goal.includes("fixture:prepare-workflow")
        ? JSON.stringify({
            action: "tool",
            tool: "prepareWorkflowDraft",
            input: {
              workflow: {
                id: "fixture-ai-workflow",
                name: "Fixture AI Prepared Workflow",
                description: "Prepared only; never automatically saved or run.",
                mode: "passive",
                builtIn: false,
                inputs: [],
                scope: { requireInScope: true, allowActive: false, maxRequests: 0, timeoutMs: 10000, delayMs: 0, maxResults: 20 },
                steps: [{ id: "headers", title: "Review fixture headers", kind: "security-headers", config: {} }]
              },
              note: "Review before saving."
            },
            rationale: "Prepare a visible passive workflow draft."
          })
      : isPlanner && goal.includes("fixture:run-workflow") && resultFor("runWorkflow")
        ? JSON.stringify({ action: "finish", rationale: "Existing workflow completed through the normal run contract.", findings: [] })
      : isPlanner && goal.includes("fixture:run-workflow")
        ? JSON.stringify({
            action: "tool",
            tool: "runWorkflow",
            input: { workflowId: "builtin-auth-state-check", inputs: { "capture-id": workflowCaptureId } },
            rationale: "Run the selected saved active workflow through its normal capability contract."
          })
      : isPlanner && goal.includes("fixture:intercept-edit") && resultFor("prepareInterceptEdit")
        ? JSON.stringify({ action: "finish", rationale: "Intercept edit is visibly prepared and remains paused.", findings: [] })
      : isPlanner && goal.includes("fixture:intercept-edit") && resultFor("getInterceptQueue")
        ? (() => {
            const queue = (resultFor("getInterceptQueue")?.data?.queue || []) as Array<{ id?: string; draft?: { url?: string } }>;
            const item = queue[0];
            return JSON.stringify({
              action: "tool",
              tool: "prepareInterceptEdit",
              input: { id: item?.id || "", draft: { method: "POST", url: item?.draft?.url || plannerContext?.targetOrigin || "", headers: { "x-ai-prepared": "1" }, body: '{"prepared":true}' }, note: "Operator must still forward or drop." },
              rationale: "Load bounded edits into the visible paused item."
            });
          })()
      : isPlanner && goal.includes("fixture:intercept-edit")
        ? JSON.stringify({ action: "tool", tool: "getInterceptQueue", input: { limit: 5 }, rationale: "Inspect the visible paused queue first." })
      : isPlanner && goal.includes("fixture:plugin-safety") && resultFor("getPluginInventory")
        ? JSON.stringify({ action: "tool", tool: "installPlugin", input: { path: "/tmp/forbidden" }, rationale: "This prohibited mutation must be rejected." })
      : isPlanner && goal.includes("fixture:plugin-safety")
        ? JSON.stringify({ action: "tool", tool: "getPluginInventory", input: {}, rationale: "Read plugin inventory without mutation." })
      : isPlanner && goal.includes("fixture:unsafe-invisible")
        ? JSON.stringify({ action: "tool", tool: "installPlugin", input: { path: "/tmp/forbidden" }, rationale: "Attempt a prohibited invisible mutation." })
      : isPlanner && goal.includes("fixture:identity-context") && resultFor("getIdentityLabContext")
        ? JSON.stringify({ action: "finish", rationale: "Identity metadata reviewed without secret state.", findings: [] })
      : isPlanner && goal.includes("fixture:identity-context")
        ? JSON.stringify({ action: "tool", tool: "getIdentityLabContext", input: {}, rationale: "Read bounded Identity Lab metadata." })
      : isPlanner && goal.includes("fixture:budget-replay")
        ? JSON.stringify({ action: "tool", tool: "sendReplay", input: { draft: { method: "GET", url: `${plannerContext?.targetOrigin || "http://127.0.0.1"}/api/echo`, headers: {}, body: "" } }, rationale: "Exercise the replay budget." })
      : isPlanner && goal.includes("fixture:budget-workflow")
        ? JSON.stringify({ action: "tool", tool: "runWorkflow", input: { workflowId: "demo-workflow-api-hardening", inputs: {} }, rationale: "Exercise the workflow budget." })
      : isPlanner && goal.includes("fixture:budget-steps")
        ? JSON.stringify({ action: "tool", tool: "getBrowserState", input: {}, rationale: "Exercise the tool-call budget." })
      : isPlanner && user.includes("out-of-scope")
        ? JSON.stringify({
            action: "tool",
            tool: "navigateBrowser",
            input: { url: "https://outside.fixture.test/private" },
            rationale: "Scripted out-of-scope policy check"
          })
        : isPlanner && user.includes("incomplete finding")
          ? JSON.stringify({
              action: "finish",
              rationale: "Fixture incomplete evidence check",
              findings: [{ title: "Incomplete fixture finding", confidence: "high", evidenceRefs: [] }]
            })
        : isPlanner && user.includes("complete finding")
          ? JSON.stringify({
              action: "finish",
              rationale: "Fixture review complete",
              findings: [{
                title: "Fixture evidence finding",
                confidence: "medium",
                evidenceRefs: ["capture:demo-cap-account"],
                affectedAssets: ["https://api.demo.radar.test/account"],
                reproductionNotes: "Inspect the selected account capture.",
                severityRationale: "The recorded response demonstrates the fixture condition.",
                remediation: "Apply the fixture hardening recommendation.",
                notes: "Created by the deterministic regression planner.",
                uncertainties: ["Confirm behavior in the deployed environment."]
              }]
            })
          : isPlanner
              ? JSON.stringify({ action: "finish", rationale: "Deterministic passive review complete", findings: [] })
              : JSON.stringify({
                  summary: "Deterministic fixture summary",
                  observations: ["Scoped evidence was reviewed."],
                  uncertainties: ["Fixture response only."],
                  drafts: [{
                    label: "Fixture replay draft",
                    rationale: "Prepared for operator review only.",
                    draft: { method: "GET", url: "http://127.0.0.1/fixture", headers: { "x-radar-fixture": "1" }, body: "" }
                  }],
                  items: [{ title: "Review fixture scope", steps: ["Confirm the saved origin."] }],
                  notes: "Deterministic fixture report notes",
                  evidenceRefs: ["capture:demo-cap-dashboard"],
                  steps: [{ label: "Open scoped fixture", action: "navigate", url: "http://127.0.0.1/fixture" }],
                  findings: ["Fixture TLS observation"],
                  recommendations: ["Retain bounded local testing."],
                  text: "Deterministic custom skill output"
                });
    sendJson(response, 200, {
      choices: [{ message: { content } }]
    });
    return;
  }
  if (url.pathname === "/api/echo") {
    sendJson(response, 200, {
      method: labRequest.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: labRequest.headers,
      body: labRequest.body
    });
    return;
  }
  if (url.pathname === "/api/users") {
    sendJson(
      response,
      200,
      { users: [{ id: 1, role: url.searchParams.get("role") || "viewer" }] },
      { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" }
    );
    return;
  }
  if (url.pathname === "/api/login") {
    sendJson(response, 200, { ok: true }, { "set-cookie": "radar_session=fixture-session; HttpOnly; SameSite=Strict" });
    return;
  }
  if (url.pathname === "/api/account") {
    const authorized =
      labRequest.headers.authorization === "Bearer fixture-token" ||
      labRequest.headers.cookie?.includes("radar_session=fixture-session");
    sendJson(response, authorized ? 200 : 401, authorized ? { account: "fixture-user" } : { error: "unauthorized" });
    return;
  }
  if (url.pathname === "/api/redirect") {
    response.writeHead(302, { location: "/api/users?role=redirected" });
    response.end();
    return;
  }
  if (url.pathname === "/api/slow") {
    const requested = Number(url.searchParams.get("ms")) || 50;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(requested, 0), 5_000)));
    sendJson(response, 200, { delayedMs: Math.min(Math.max(requested, 0), 5_000) });
    return;
  }
  if (url.pathname === "/api/large") {
    response.writeHead(200, {
      "content-type": "text/plain",
      "content-length": "130000",
      "x-fixture-size": "130000"
    });
    response.end("x".repeat(130_000));
    return;
  }
  const statusMatch = url.pathname.match(/^\/api\/status\/(\d{3})$/);
  if (statusMatch) {
    const status = Math.min(Math.max(Number(statusMatch[1]), 100), 599);
    sendJson(response, status, { status });
    return;
  }
  if (url.pathname === "/graphql") {
    sendJson(response, 200, { data: { fixtureOperation: true } });
    return;
  }
  if (url.pathname === "/openapi.json") {
    sendJson(response, 200, {
      openapi: "3.0.3",
      info: { title: "Radar Target Lab", version: "1.0.0" },
      paths: { "/api/users": { get: { operationId: "listUsers", responses: { "200": { description: "OK" } } } } }
    });
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Radar Target Lab</title><a href='/api/users'>Users</a>");
}

export async function startTargetLab(): Promise<TargetLab> {
  const requests: LabRequest[] = [];
  const socketMessages: string[] = [];
  const sockets = new Set<WebSocket>();
  let origin = "";
  let closed = false;
  let recoverableAttempts = 0;
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    const labRequest: LabRequest = {
      id: requests.length + 1,
      method: request.method || "GET",
      url: new URL(request.url || "/", origin).toString(),
      path: request.url || "/",
      headers: normalizedHeaders(request.headers),
      body,
      receivedAt: new Date().toISOString()
    };
    requests.push(labRequest);
    if (new URL(labRequest.url).pathname === "/api/recoverable") {
      recoverableAttempts += 1;
      sendJson(response, recoverableAttempts === 1 ? 503 : 200, { attempt: recoverableAttempts });
      return;
    }
    await route(request, response, labRequest);
  });
  const webSockets = new WebSocketServer({ noServer: true });
  webSockets.on("connection", (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: "fixture:ready" }));
    socket.on("message", (message) => {
      const payload = message.toString();
      socketMessages.push(payload);
      socket.send(payload);
    });
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url || "/", origin).pathname !== "/socket") {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => webSockets.emit("connection", webSocket, request));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Target lab did not bind a TCP port.");
  origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    socketUrl: `ws://127.0.0.1:${address.port}/socket`,
    requests,
    socketMessages,
    reset: () => {
      requests.splice(0, requests.length);
      socketMessages.splice(0, socketMessages.length);
      recoverableAttempts = 0;
    },
    waitForRequests: async (count, timeoutMs = 10_000) => {
      const startedAt = Date.now();
      while (requests.length < count) {
        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error(`Target lab expected ${count} request(s), received ${requests.length}.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return requests;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.terminate();
      webSockets.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  };
}

export function exchangeWebSocketThroughRadarProxy(proxyPort: number, url: string, payload: string) {
  return new Promise<string[]>((resolve, reject) => {
    const received: string[] = [];
    const socket = new WebSocketClient(url, {
      agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`)
    });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("WebSocket proxy fixture timed out."));
    }, 10_000);
    socket.on("open", () => socket.send(payload));
    socket.on("message", (message) => {
      received.push(message.toString());
      if (received.includes(payload)) socket.close(1000, "fixture-complete");
    });
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve(received);
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function startHttpsTargetLab({
  caCertificatePath,
  caKeyPath
}: {
  caCertificatePath?: string;
  caKeyPath?: string;
} = {}): Promise<HttpsTargetLab> {
  const requests: LabRequest[] = [];
  const certificateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-https-lab-"));
  const keyPath = path.join(certificateDirectory, "lab-key.pem");
  const certificatePath = path.join(certificateDirectory, "lab-cert.pem");
  if (caCertificatePath && caKeyPath) {
    const requestPath = path.join(certificateDirectory, "lab.csr");
    const extensionsPath = path.join(certificateDirectory, "lab-extensions.cnf");
    fs.writeFileSync(extensionsPath, "subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
    execFileSync("openssl", [
      "req", "-new", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath,
      "-out", requestPath,
      "-subj", "/CN=127.0.0.1/O=Radar Regression Lab/C=US"
    ], { stdio: "ignore" });
    execFileSync("openssl", [
      "x509", "-req",
      "-in", requestPath,
      "-CA", caCertificatePath,
      "-CAkey", caKeyPath,
      "-set_serial", String(Date.now()),
      "-out", certificatePath,
      "-days", "1",
      "-sha256",
      "-extfile", extensionsPath
    ], { stdio: "ignore" });
  } else {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath,
      "-out", certificatePath,
      "-subj", "/CN=127.0.0.1/O=Radar Regression Lab/C=US",
      "-addext", "subjectAltName=IP:127.0.0.1",
      "-days", "1"
    ], { stdio: "ignore" });
  }
  const certificate = { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certificatePath, "utf8") };
  let origin = "";
  let closed = false;
  const server = https.createServer({ key: certificate.key, cert: certificate.cert }, async (request, response) => {
    const body = await readBody(request);
    const labRequest: LabRequest = {
      id: requests.length + 1,
      method: request.method || "GET",
      url: new URL(request.url || "/", origin).toString(),
      path: request.url || "/",
      headers: normalizedHeaders(request.headers),
      body,
      receivedAt: new Date().toISOString()
    };
    requests.push(labRequest);
    await route(request, response, labRequest);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTPS target lab did not bind a TCP port.");
  origin = `https://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    certificate: certificate.cert,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      fs.rmSync(certificateDirectory, { recursive: true, force: true });
    }
  };
}

export function sendSecureThroughRadarProxy(proxyPort: number, url: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      agent: new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`),
      rejectUnauthorized: false
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.setTimeout(15_000, () => request.destroy(new Error("HTTPS proxy fixture timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export type ProxyRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export function sendThroughRadarProxy(proxyPort: number, url: string, options: ProxyRequestOptions = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: options.method || "GET",
        path: target.toString(),
        headers: {
          host: target.host,
          connection: "close",
          ...(options.body ? { "content-length": String(Buffer.byteLength(options.body)) } : {}),
          ...options.headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        }));
      }
    );
    request.setTimeout(options.timeoutMs || 15_000, () => request.destroy(new Error("Proxy request timed out.")));
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}
