import type { IncomingMessage } from "node:http";
import type { Connect } from "vite";
import { handleDemoRequest } from "./demoApi";

const MAX_BODY_BYTES = 16_384;

function readHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  if (typeof value === "string") {
    return value;
  }
  return value?.[0] ?? null;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let exceeded = false;

    request.on("data", (chunk: Buffer | string) => {
      if (exceeded) {
        return;
      }

      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      length += buffer.length;
      if (length > MAX_BODY_BYTES) {
        exceeded = true;
        return;
      }
      chunks.push(buffer);
    });

    request.on("end", () => {
      if (exceeded) {
        reject(new Error("Demo request body exceeds 16 KB."));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (error: Error) => {
      reject(error);
    });
  });
}

export function createDemoApiMiddleware(): Connect.NextHandleFunction {
  return async (request, response, next) => {
    const requestUrl = request.url ?? "/";
    const url = new URL(requestUrl, "http://127.0.0.1:3000");
    if (!url.pathname.startsWith("/api/")) {
      next();
      return;
    }

    let body = "";
    try {
      body = await readBody(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request body could not be read.";
      response.statusCode = 413;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: message }));
      return;
    }

    const result = handleDemoRequest({
      method: request.method?.toUpperCase() ?? "GET",
      pathname: url.pathname,
      searchParams: url.searchParams,
      origin: readHeader(request, "origin"),
      body
    });

    if (result === null) {
      next();
      return;
    }

    response.statusCode = result.status;
    for (const [name, value] of Object.entries(result.headers)) {
      response.setHeader(name, value);
    }
    response.end(result.body);
  };
}
