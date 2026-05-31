import type { CapturedRequest, WebSocketEvent } from "./domain.js";

export type TrafficQueryField =
  | "method"
  | "host"
  | "path"
  | "url"
  | "status"
  | "mime"
  | "type"
  | "source"
  | "initiator"
  | "req.header"
  | "resp.header"
  | "req.body"
  | "resp.body"
  | "tag"
  | "comment"
  | "direction"
  | "opcode"
  | "payload"
  | "error";

export type TrafficQueryOp = "eq" | "contains";

export type TrafficQueryTerm = {
  type: "term";
  field: TrafficQueryField | "text";
  op: TrafficQueryOp;
  value: string;
  values?: string[];
};

export type TrafficQueryNode =
  | TrafficQueryTerm
  | { type: "and"; nodes: TrafficQueryNode[] }
  | { type: "or"; nodes: TrafficQueryNode[] }
  | { type: "not"; node: TrafficQueryNode };

export type TrafficQueryParseResult =
  | { ok: true; query: TrafficQueryNode; mode: "structured" | "text" }
  | { ok: false; error: string };

export type TrafficQueryContext = {
  tagsByEvidenceId?: Record<string, string[]>;
  commentsByEvidenceId?: Record<string, string>;
};

const FIELD_ALIASES: Record<string, TrafficQueryField> = {
  method: "method",
  host: "host",
  path: "path",
  url: "url",
  status: "status",
  mime: "mime",
  mimetype: "mime",
  type: "type",
  source: "source",
  initiator: "initiator",
  "req.header": "req.header",
  requestheader: "req.header",
  "resp.header": "resp.header",
  responseheader: "resp.header",
  "req.body": "req.body",
  requestbody: "req.body",
  "resp.body": "resp.body",
  responsebody: "resp.body",
  tag: "tag",
  comment: "comment",
  direction: "direction",
  opcode: "opcode",
  payload: "payload",
  error: "error"
};

const MAX_QUERY_LENGTH = 400;

type Token =
  | { type: "word"; value: string }
  | { type: "string"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "and" }
  | { type: "or" }
  | { type: "not" }
  | { type: "colon" }
  | { type: "tilde" }
  | { type: "comma" };

function normalizeField(raw: string): TrafficQueryField | "text" {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return FIELD_ALIASES[key] || "text";
}

function tokenize(input: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }
    if (char === ":") {
      tokens.push({ type: "colon" });
      index += 1;
      continue;
    }
    if (char === "~") {
      tokens.push({ type: "tilde" });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      let value = "";
      while (index < input.length && input[index] !== quote) {
        if (input[index] === "\\" && index + 1 < input.length) {
          value += input[index + 1];
          index += 2;
          continue;
        }
        value += input[index];
        index += 1;
      }
      if (index >= input.length) {
        return { error: "Unclosed quoted value." };
      }
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }
    let word = "";
    while (index < input.length && !/[\s():~,"']/.test(input[index])) {
      word += input[index];
      index += 1;
    }
    if (!word) {
      return { error: `Unexpected character "${char}".` };
    }
    const upper = word.toUpperCase();
    if (upper === "AND") {
      tokens.push({ type: "and" });
    } else if (upper === "OR") {
      tokens.push({ type: "or" });
    } else if (upper === "NOT") {
      tokens.push({ type: "not" });
    } else {
      tokens.push({ type: "word", value: word });
    }
  }
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): TrafficQueryNode {
    const node = this.parseOr();
    if (this.peek()) {
      throw new Error("Unexpected token after query expression.");
    }
    return node;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private consume() {
    return this.tokens[this.index++];
  }

  private parseOr(): TrafficQueryNode {
    const nodes = [this.parseAnd()];
    while (this.peek()?.type === "or") {
      this.consume();
      nodes.push(this.parseAnd());
    }
    return nodes.length === 1 ? nodes[0] : { type: "or", nodes };
  }

  private parseAnd(): TrafficQueryNode {
    const nodes = [this.parseNot()];
    while (this.peek() && this.peek()?.type !== "or" && this.peek()?.type !== "rparen") {
      if (this.peek()?.type === "and") {
        this.consume();
      }
      if (!this.peek() || this.peek()?.type === "or" || this.peek()?.type === "rparen") {
        break;
      }
      nodes.push(this.parseNot());
    }
    return nodes.length === 1 ? nodes[0] : { type: "and", nodes };
  }

  private parseNot(): TrafficQueryNode {
    if (this.peek()?.type === "not") {
      this.consume();
      return { type: "not", node: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): TrafficQueryNode {
    const token = this.peek();
    if (!token) {
      throw new Error("Unexpected end of query.");
    }
    if (token.type === "lparen") {
      this.consume();
      const node = this.parseOr();
      if (this.consume()?.type !== "rparen") {
        throw new Error("Expected closing parenthesis.");
      }
      return node;
    }
    return this.parseAtom();
  }

  private parseAtom(): TrafficQueryTerm {
    const first = this.consume();
    if (!first || (first.type !== "word" && first.type !== "string")) {
      throw new Error("Expected query term.");
    }
    const opToken = this.peek();
    if (opToken?.type === "colon" || opToken?.type === "tilde") {
      const op: TrafficQueryOp = opToken.type === "tilde" ? "contains" : "eq";
      this.consume();
      const values = this.readValues();
      const field = normalizeField(first.type === "word" ? first.value : first.value);
      if (field === "text") {
        throw new Error(`Unknown field "${first.type === "word" ? first.value : first.value}".`);
      }
      return {
        type: "term",
        field,
        op,
        value: values[0] || "",
        values: values.length > 1 ? values : undefined
      };
    }
    const text = first.type === "string" ? first.value : first.value;
    return { type: "term", field: "text", op: "contains", value: text };
  }

  private readValues() {
    const values: string[] = [];
    while (true) {
      const token = this.peek();
      if (!token || token.type === "and" || token.type === "or" || token.type === "not" || token.type === "rparen") {
        break;
      }
      if (token.type === "comma") {
        this.consume();
        continue;
      }
      const next = this.consume();
      if (!next || (next.type !== "word" && next.type !== "string")) {
        throw new Error("Expected field value.");
      }
      values.push(next.value);
      if (this.peek()?.type !== "comma") {
        break;
      }
    }
    if (values.length === 0) {
      throw new Error("Expected field value.");
    }
    return values;
  }
}

export function parseTrafficQuery(input: unknown): TrafficQueryParseResult {
  const text = String(input || "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!text) {
    return { ok: true, query: { type: "term", field: "text", op: "contains", value: "" }, mode: "text" };
  }
  if (!/[:()~]|\b(?:AND|OR|NOT)\b/i.test(text)) {
    return { ok: true, query: { type: "term", field: "text", op: "contains", value: text }, mode: "text" };
  }
  const tokenResult = tokenize(text);
  if ("error" in tokenResult) {
    return { ok: false, error: tokenResult.error };
  }
  try {
    const query = new Parser(tokenResult).parse();
    return { ok: true, query, mode: "structured" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid query." };
  }
}

function serializeHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function headerValue(headers: Record<string, string>, needle: string) {
  const target = needle.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target || key.toLowerCase().includes(target)) {
      return `${key}: ${value}`;
    }
  }
  return serializeHeaders(headers);
}

function statusFamily(status: number | null | undefined) {
  if (status === null || status === undefined || !Number.isFinite(status)) {
    return "";
  }
  const rounded = Math.round(status);
  return `${Math.floor(rounded / 100)}xx`;
}

function matchesValues(actual: string, op: TrafficQueryOp, value: string, values?: string[]) {
  const haystack = actual.toLowerCase();
  const needles = (values && values.length > 0 ? values : [value]).map((item) => item.toLowerCase()).filter(Boolean);
  if (needles.length === 0) {
    return true;
  }
  return needles.some((needle) => {
    if (op === "contains") {
      return haystack.includes(needle);
    }
    return haystack === needle || haystack.includes(needle);
  });
}

function captureFieldValue(capture: CapturedRequest, field: TrafficQueryField, context?: TrafficQueryContext) {
  switch (field) {
    case "method":
      return capture.method;
    case "host":
      return capture.host;
    case "path":
      return capture.path;
    case "url":
      return capture.url;
    case "status":
      return capture.status === null || capture.status === undefined ? "" : `${capture.status} ${statusFamily(capture.status)}`;
    case "mime":
      return capture.mimeType;
    case "type":
      return capture.type || capture.source;
    case "source":
      return capture.source;
    case "initiator":
      return capture.initiator || "";
    case "req.header":
      return serializeHeaders(capture.requestHeaders);
    case "resp.header":
      return serializeHeaders(capture.responseHeaders);
    case "req.body":
      return capture.requestBody;
    case "resp.body":
      return capture.responseBody;
    case "tag":
      return (context?.tagsByEvidenceId?.[capture.id] || []).join(" ");
    case "comment":
      return context?.commentsByEvidenceId?.[capture.id] || "";
    default:
      return "";
  }
}

function webSocketFieldValue(event: WebSocketEvent, field: TrafficQueryField, context?: TrafficQueryContext) {
  switch (field) {
    case "host":
      return event.host;
    case "url":
      return event.url;
    case "direction":
      return event.direction;
    case "opcode":
      return event.opcode === undefined ? "" : String(event.opcode);
    case "payload":
      return event.payloadData;
    case "error":
      return event.error || "";
    case "initiator":
      return event.initiator || "";
    case "req.header":
      return serializeHeaders(event.requestHeaders || {});
    case "resp.header":
      return serializeHeaders(event.responseHeaders || {});
    case "status":
      return event.status === undefined ? "" : `${event.status}`;
    case "tag":
      return (context?.tagsByEvidenceId?.[event.id] || []).join(" ");
    case "comment":
      return context?.commentsByEvidenceId?.[event.id] || "";
    default:
      return "";
  }
}

function captureTextBlob(capture: CapturedRequest, context?: TrafficQueryContext) {
  return [
    capture.method,
    capture.url,
    capture.host,
    capture.path,
    capture.status,
    capture.statusText,
    capture.mimeType,
    capture.type,
    capture.source,
    capture.initiator,
    serializeHeaders(capture.requestHeaders),
    capture.requestBody,
    serializeHeaders(capture.responseHeaders),
    capture.responseBody,
    ...(context?.tagsByEvidenceId?.[capture.id] || []),
    context?.commentsByEvidenceId?.[capture.id] || ""
  ]
    .filter((value) => value !== null && value !== undefined)
    .join("\n")
    .toLowerCase();
}

function webSocketTextBlob(event: WebSocketEvent, context?: TrafficQueryContext) {
  return [
    event.url,
    event.host,
    event.direction,
    event.opcode,
    event.payloadData,
    event.error,
    event.initiator,
    serializeHeaders(event.requestHeaders || {}),
    serializeHeaders(event.responseHeaders || {}),
    ...(context?.tagsByEvidenceId?.[event.id] || []),
    context?.commentsByEvidenceId?.[event.id] || ""
  ]
    .filter((value) => value !== null && value !== undefined)
    .join("\n")
    .toLowerCase();
}

function evaluateTermAgainstText(text: string, term: TrafficQueryTerm) {
  if (term.field !== "text") {
    return false;
  }
  return matchesValues(text, term.op, term.value, term.values);
}

function evaluateCaptureTerm(capture: CapturedRequest, term: TrafficQueryTerm, context?: TrafficQueryContext) {
  if (term.field === "text") {
    return evaluateTermAgainstText(captureTextBlob(capture, context), term);
  }
  if (term.field === "req.header" && term.op === "eq" && term.value.includes(":")) {
    const [name, ...rest] = term.value.split(":");
    return matchesValues(headerValue(capture.requestHeaders, name.trim()), term.op, rest.join(":").trim(), term.values);
  }
  if (term.field === "resp.header" && term.op === "eq" && term.value.includes(":")) {
    const [name, ...rest] = term.value.split(":");
    return matchesValues(headerValue(capture.responseHeaders, name.trim()), term.op, rest.join(":").trim(), term.values);
  }
  if (term.field === "status") {
    const statusText = capture.status === null || capture.status === undefined ? "" : String(capture.status);
    const family = statusFamily(capture.status);
    const actual = `${statusText} ${family}`.trim();
    const needles = (term.values && term.values.length > 0 ? term.values : [term.value]).map((item) => item.toLowerCase());
    return needles.some((needle) => {
      if (/^\dxx$/.test(needle)) {
        return family.toLowerCase() === needle;
      }
      if (/^\d{3}$/.test(needle)) {
        return statusText === needle;
      }
      return matchesValues(actual, term.op, needle);
    });
  }
  return matchesValues(captureFieldValue(capture, term.field, context), term.op, term.value, term.values);
}

function evaluateWebSocketTerm(event: WebSocketEvent, term: TrafficQueryTerm, context?: TrafficQueryContext) {
  if (term.field === "text") {
    return evaluateTermAgainstText(webSocketTextBlob(event, context), term);
  }
  const httpOnlyFields: TrafficQueryField[] = ["method", "path", "mime", "type", "source", "req.body", "resp.body"];
  if (httpOnlyFields.includes(term.field)) {
    return false;
  }
  return matchesValues(webSocketFieldValue(event, term.field, context), term.op, term.value, term.values);
}

function evaluateNode<T>(
  item: T,
  node: TrafficQueryNode,
  evaluateTerm: (item: T, term: TrafficQueryTerm) => boolean
): boolean {
  switch (node.type) {
    case "term":
      if (node.field === "text" && !node.value.trim()) {
        return true;
      }
      return evaluateTerm(item, node);
    case "and":
      return node.nodes.every((child) => evaluateNode(item, child, evaluateTerm));
    case "or":
      return node.nodes.some((child) => evaluateNode(item, child, evaluateTerm));
    case "not":
      return !evaluateNode(item, node.node, evaluateTerm);
  }
}

export function evaluateCaptureQuery(
  capture: CapturedRequest,
  query: TrafficQueryNode,
  context?: TrafficQueryContext
) {
  return evaluateNode(capture, query, (item, term) => evaluateCaptureTerm(item, term, context));
}

export function evaluateWebSocketQuery(
  event: WebSocketEvent,
  query: TrafficQueryNode,
  context?: TrafficQueryContext
) {
  return evaluateNode(event, query, (item, term) => evaluateWebSocketTerm(item, term, context));
}

export function filterCapturesByQuery(
  captures: CapturedRequest[],
  input: unknown,
  context?: TrafficQueryContext
) {
  const parsed = parseTrafficQuery(input);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error, captures: [] as CapturedRequest[] };
  }
  if (parsed.query.type === "term" && parsed.query.field === "text" && !parsed.query.value.trim()) {
    return { ok: true as const, query: parsed.query, mode: parsed.mode, captures };
  }
  return {
    ok: true as const,
    query: parsed.query,
    mode: parsed.mode,
    captures: captures.filter((capture) => evaluateCaptureQuery(capture, parsed.query, context))
  };
}

export function filterWebSocketEventsByQuery(
  events: WebSocketEvent[],
  input: unknown,
  context?: TrafficQueryContext
) {
  const parsed = parseTrafficQuery(input);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error, events: [] as WebSocketEvent[] };
  }
  if (parsed.query.type === "term" && parsed.query.field === "text" && !parsed.query.value.trim()) {
    return { ok: true as const, query: parsed.query, mode: parsed.mode, events };
  }
  return {
    ok: true as const,
    query: parsed.query,
    mode: parsed.mode,
    events: events.filter((event) => evaluateWebSocketQuery(event, parsed.query, context))
  };
}

export const TRAFFIC_QUERY_EXAMPLES = [
  'method:POST path:/api status:401,403 mime:json',
  "req.header:authorization",
  "resp.body:error",
  "status:4xx host:allowed.test",
  "direction:sent payload:ping"
];
