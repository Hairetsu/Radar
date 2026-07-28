import { isAllowedTarget } from "../../shared/allowlist.js";
import { normalizeBurstLimits } from "../../shared/burst.js";
import type {
  LocalContext,
  ReplayDraft,
  ReplayResult,
  WebSocketReplayDraft
} from "../../shared/domain.js";
import { prepareReplayDraft } from "../../shared/replayVariables.js";
import { truncateText } from "../../shared/text.js";
import {
  normalizeWebSocketReplayDraft
} from "../../shared/websocketReplay.js";
import type { LocalStore } from "../localStore.js";

type ReplayControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  allowlist: () => string[];
  regressionMode: boolean;
  recordWebSocket: (input: {
    url: string;
    direction: "sent" | "received";
    payload: string;
    requestHeaders: Record<string, string>;
  }) => void;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createReplayController(
  deps: ReplayControllerDeps
) {
  async function sendRequest(
    input:
      | ReplayDraft
      | { draft?: ReplayDraft; environmentId?: string },
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<ReplayResult> {
    const record =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : null;
    const environmentId =
      record && "environmentId" in record
        ? String(record.environmentId || "")
        : "";
    const draftInput =
      record && "draft" in record ? record.draft : input;
    const draft = prepareReplayDraft(
      draftInput as ReplayDraft,
      deps
        .store()
        .listReplayEnvironments(deps.context().workspace.id),
      environmentId
    );
    if (!isAllowedTarget(draft.url, deps.allowlist())) {
      throw new Error(
        "Replay URL is outside the current scope allowlist."
      );
    }

    const started = Date.now();
    const abort = new AbortController();
    const forwardAbort = () => abort.abort();
    if (options.signal?.aborted) {
      abort.abort();
    } else {
      options.signal?.addEventListener("abort", forwardAbort, {
        once: true
      });
    }
    const defaultTimeoutMs = deps.regressionMode ? 3_000 : 30_000;
    const timeout = setTimeout(
      () => abort.abort(),
      Math.min(
        Math.max(
          Number(options.timeoutMs || defaultTimeoutMs),
          1000
        ),
        30_000
      )
    );

    try {
      const response = await fetch(draft.url, {
        method: draft.method,
        headers: draft.headers,
        body: draft.body || undefined,
        redirect: "manual",
        signal: abort.signal
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - started,
        headers: Object.fromEntries(response.headers.entries()),
        body: truncateText(buffer.toString("utf8")),
        bytes: buffer.length
      };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  async function sendWebSocketReplay(
    input: WebSocketReplayDraft
  ) {
    const draft = normalizeWebSocketReplayDraft(input);
    if (!draft) {
      throw new Error("WebSocket replay draft was invalid.");
    }
    if (!isAllowedTarget(draft.url, deps.allowlist())) {
      throw new Error(
        "WebSocket URL is outside the current scope allowlist."
      );
    }

    type ReplaySocket = {
      addEventListener: (
        type: string,
        listener: (event?: { data?: unknown }) => void
      ) => void;
      send: (data: string) => void;
      close: () => void;
    };
    const WebSocketCtor = (
      globalThis as unknown as {
        WebSocket?: new (url: string) => ReplaySocket;
      }
    ).WebSocket;
    if (!WebSocketCtor) {
      throw new Error(
        "WebSocket support is not available in this runtime."
      );
    }

    const started = Date.now();
    return await new Promise<{
      ok: boolean;
      error?: string;
      handshakeStatus?: number;
      responsePayload?: string;
      durationMs: number;
    }>((resolve) => {
      let settled = false;
      const finish = (result: {
        ok: boolean;
        error?: string;
        handshakeStatus?: number;
        responsePayload?: string;
        durationMs: number;
      }) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      const socket = new WebSocketCtor(draft.url);
      let responsePayload = "";
      const timeout = setTimeout(() => {
        finish({
          ok: false,
          error: "WebSocket replay timed out.",
          durationMs: Date.now() - started
        });
        socket.close();
      }, 15_000);
      socket.addEventListener("open", () => {
        socket.send(draft.payload);
        deps.recordWebSocket({
          url: draft.url,
          direction: "sent",
          payload: draft.payload,
          requestHeaders: draft.requestHeaders
        });
      });
      socket.addEventListener("message", (event) => {
        responsePayload = truncateText(
          String(event?.data ?? "")
        ).slice(0, 100_000);
        deps.recordWebSocket({
          url: draft.url,
          direction: "received",
          payload: responsePayload,
          requestHeaders: draft.requestHeaders
        });
        clearTimeout(timeout);
        socket.close();
        finish({
          ok: true,
          responsePayload,
          durationMs: Date.now() - started
        });
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        finish({
          ok: false,
          error: "WebSocket replay failed.",
          durationMs: Date.now() - started
        });
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (!settled) {
          finish({
            ok: true,
            responsePayload,
            durationMs: Date.now() - started
          });
        }
      });
    });
  }

  async function runBurst(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const requestPayload = {
      draft: (payload.request || payload) as ReplayDraft,
      environmentId: String(payload.environmentId || "")
    };
    const { count, concurrency, delayMs } =
      normalizeBurstLimits(payload);
    const results: Array<ReplayResult & { index: number }> = [];
    let cursor = 0;

    async function worker() {
      while (cursor < count) {
        const index = cursor;
        cursor += 1;
        if (delayMs > 0 && index > 0) {
          await delay(delayMs);
        }
        try {
          const response = await sendRequest(requestPayload);
          results[index] = { ...response, index: index + 1 };
        } catch (error) {
          results[index] = {
            index: index + 1,
            ok: false,
            status: 0,
            statusText:
              error instanceof Error
                ? error.message
                : "Replay failed",
            durationMs: 0,
            headers: {},
            body: "",
            bytes: 0
          };
        }
      }
    }

    await Promise.all(
      Array.from({ length: concurrency }, () => worker())
    );
    return {
      count,
      concurrency,
      results,
      averageMs: Math.round(
        results.reduce(
          (sum, item) => sum + item.durationMs,
          0
        ) / results.length
      ),
      failures: results.filter(
        (item) => !item.ok || item.status >= 400
      ).length
    };
  }

  return { sendRequest, sendWebSocketReplay, runBurst };
}
