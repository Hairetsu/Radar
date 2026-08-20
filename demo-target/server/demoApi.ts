export type DemoRequest = Readonly<{
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  origin: string | null;
  body: string;
}>;

export type DemoResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}>;

type CargoRecord = Readonly<{
  id: string;
  client: string;
  route: string;
  status: string;
  eta: string;
  internalRate: number;
  clientToken: string;
}>;

const CARGO: readonly CargoRecord[] = [
  {
    id: "HL-2048",
    client: "Orion Machine Works",
    route: "Newark > Reykjavik",
    status: "Customs hold",
    eta: "Aug 20, 16:40",
    internalRate: 18420,
    clientToken: "DEMO_ORION_7Q2"
  },
  {
    id: "HL-2081",
    client: "Vela Biologics",
    route: "Boston > Rotterdam",
    status: "In transit",
    eta: "Aug 22, 09:15",
    internalRate: 32600,
    clientToken: "DEMO_VELA_1B9"
  },
  {
    id: "HL-2117",
    client: "Northwind Aeronautics",
    route: "Baltimore > Oslo",
    status: "Cleared",
    eta: "Aug 21, 11:30",
    internalRate: 44750,
    clientToken: "DEMO_NORTHWIND_4K8"
  }
];

const INVOICES: Readonly<Record<string, Readonly<Record<string, string | number>>>> = {
  "INV-1007": {
    id: "INV-1007",
    accountId: "ACCT-17",
    customer: "Orion Machine Works",
    issued: "2026-08-12",
    due: "2026-09-11",
    total: 18420,
    status: "Pending",
    bankReference: "DEMO-WIRE-88017"
  },
  "INV-1008": {
    id: "INV-1008",
    accountId: "ACCT-92",
    customer: "Vela Biologics",
    issued: "2026-08-13",
    due: "2026-09-12",
    total: 32600,
    status: "Paid",
    bankReference: "DEMO-WIRE-44102"
  }
};

const FILES: Readonly<
  Record<string, Readonly<{ name: string; updatedAt: string; contents: string }>>
> = {
  "quarterly/manifest.txt": {
    name: "Q3 North Atlantic manifest",
    updatedAt: "2026-08-19T13:44:00Z",
    contents: "HL-2048 | Orion | customs hold\nHL-2081 | Vela | in transit"
  },
  "briefs/port-notice.txt": {
    name: "Port operations notice",
    updatedAt: "2026-08-18T18:10:00Z",
    contents: "Berth 4 opens at 06:30. Route refrigerated cargo through inspection lane C."
  },
  "../../../../etc/passwd": {
    name: "passwd",
    updatedAt: "2026-08-19T12:01:00Z",
    contents:
      "root:x:0:0:root:/root:/bin/bash\nharbor-demo:x:1000:1000:service account:/home/harbor:/bin/sh"
  },
  "../../../app/.env": {
    name: ".env",
    updatedAt: "2026-08-19T12:01:00Z",
    contents: "DATABASE_URL=postgres://demo:demo@db.invalid/harbor\nSIGNING_KEY=DEMO_ONLY_NOT_A_SECRET"
  }
};

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, max-age=0",
  "X-Powered-By": "Express"
} satisfies Readonly<Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function responseHeaders(origin: string | null): Record<string, string> {
  if (origin === null) {
    return { ...BASE_HEADERS };
  }

  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true"
  };
}

function jsonResponse(args: Readonly<{
  status: number;
  origin: string | null;
  data: unknown;
  extraHeaders?: Readonly<Record<string, string>>;
}>): DemoResponse {
  return {
    status: args.status,
    headers: {
      ...responseHeaders(args.origin),
      ...args.extraHeaders
    },
    body: JSON.stringify(args.data, null, 2)
  };
}

function isSqlBypass(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll(/\s+/g, " ");
  return (
    normalized.includes("' or '1'='1") ||
    normalized.includes("' or 1=1") ||
    normalized.includes("union select")
  );
}

function handleSummary(request: DemoRequest): DemoResponse {
  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: {
      terminal: "NAT-04",
      activeShipments: 42,
      customsHolds: 3,
      onTimeRate: 96.8,
      openInvoices: 7,
      arrivals: [
        { vessel: "Mercator Dawn", port: "Reykjavik", eta: "16:40", status: "Berth assigned" },
        { vessel: "Vela Star", port: "Rotterdam", eta: "09:15", status: "Under way" },
        { vessel: "Northwind", port: "Oslo", eta: "11:30", status: "Documents cleared" }
      ]
    }
  });
}

function handleCargoSearch(request: DemoRequest): DemoResponse {
  const query = request.searchParams.get("q")?.trim() ?? "";
  const sql = `SELECT cargo_id, client, route, status FROM cargo WHERE client LIKE '%${query}%'`;

  if (isSqlBypass(query)) {
    return jsonResponse({
      status: 200,
      origin: request.origin,
      data: { items: CARGO, total: CARGO.length }
    });
  }

  if ((query.match(/'/g)?.length ?? 0) % 2 === 1) {
    return jsonResponse({
      status: 500,
      origin: request.origin,
      data: {
        error: "SQLITE_ERROR: unrecognized token near string literal",
        statement: sql
      }
    });
  }

  const normalized = query.toLowerCase();
  const items = CARGO.filter(
    (record) =>
      record.id.toLowerCase().includes(normalized) ||
      record.client.toLowerCase().includes(normalized) ||
      record.route.toLowerCase().includes(normalized)
  ).map(({ id, client, route, status, eta }) => ({ id, client, route, status, eta }));

  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: { items, total: items.length }
  });
}

function handleLogin(request: DemoRequest): DemoResponse {
  const data = parseJsonRecord(request.body);
  if (data === null) {
    return jsonResponse({
      status: 400,
      origin: request.origin,
      data: { error: "Expected a JSON object." }
    });
  }

  const username = stringField(data, "username") ?? "";
  const password = stringField(data, "password") ?? "";
  const elevated = isSqlBypass(username);
  const validOperator = username === "operator" && password === "harbor-2026";

  if (!elevated && !validOperator) {
    return jsonResponse({
      status: 401,
      origin: request.origin,
      data: { error: "Invalid operator ID or password." }
    });
  }

  const role = elevated ? "administrator" : "dispatcher";
  const token = `DEMO_${role.toUpperCase()}_TOKEN`;
  return jsonResponse({
    status: 200,
    origin: request.origin,
    extraHeaders: {
      "Set-Cookie": `harbor_session=${token}; Path=/`
    },
    data: {
      user: {
        id: elevated ? "OP-001" : "OP-017",
        name: elevated ? "Avery Holt" : "Mira Chen",
        role,
        terminal: "NAT-04"
      },
      session: {
        token,
        expiresAt: "2026-08-20T09:00:00Z"
      }
    }
  });
}

function handleInvoice(request: DemoRequest): DemoResponse {
  const match = /^\/api\/billing\/invoices\/([^/]+)$/.exec(request.pathname);
  const invoiceId = match?.[1] ?? "";
  const invoice = INVOICES[invoiceId];

  if (invoice === undefined) {
    return jsonResponse({
      status: 404,
      origin: request.origin,
      data: { error: "Invoice not found." }
    });
  }

  return jsonResponse({ status: 200, origin: request.origin, data: { invoice } });
}

function handleFileRead(request: DemoRequest): DemoResponse {
  const path = request.searchParams.get("path") ?? "quarterly/manifest.txt";
  const file = FILES[path];

  if (file === undefined) {
    return jsonResponse({
      status: 404,
      origin: request.origin,
      data: { error: "Document not found.", path }
    });
  }

  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: { path, ...file }
  });
}

function handleIntegrationPreview(request: DemoRequest): DemoResponse {
  const data = parseJsonRecord(request.body);
  if (data === null) {
    return jsonResponse({
      status: 400,
      origin: request.origin,
      data: { error: "Expected a JSON object." }
    });
  }

  const url = stringField(data, "url") ?? "";
  const targetsMetadata = url.includes("169.254.169.254") || url.includes("metadata.internal");
  const preview = targetsMetadata
    ? {
        instanceId: "i-DEMO2048",
        role: "harborline-service",
        credentials: {
          accessKeyId: "ASIADEMO000000000001",
          secretAccessKey: "DEMO_ONLY_NOT_A_SECRET",
          expiresAt: "2026-08-20T04:00:00Z"
        }
      }
    : {
        title: "North Atlantic operating notice",
        condition: "Nominal",
        updatedAt: "2026-08-19T14:20:00Z"
      };

  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: {
      url,
      status: 200,
      contentType: "application/json",
      data: preview
    }
  });
}

function handleProfileUpdate(request: DemoRequest): DemoResponse {
  const data = parseJsonRecord(request.body);
  if (data === null) {
    return jsonResponse({
      status: 400,
      origin: request.origin,
      data: { error: "Expected a JSON object." }
    });
  }

  const displayName = stringField(data, "displayName") ?? "Mira Chen";
  const jobTitle = stringField(data, "jobTitle") ?? "Dispatch coordinator";
  const role = stringField(data, "role") ?? "dispatcher";

  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: {
      profile: {
        id: "OP-017",
        displayName,
        jobTitle,
        role,
        clearance: role === "administrator" ? 9 : 3,
        terminal: "NAT-04"
      }
    }
  });
}

function handleSupportPreview(request: DemoRequest): DemoResponse {
  const message = request.searchParams.get("message") ?? "Container arrived with a broken seal.";
  return jsonResponse({
    status: 200,
    origin: request.origin,
    data: {
      subject: "Customer update",
      previewHtml: `<p class="customer-copy">${message}</p>`
    }
  });
}

export function handleDemoRequest(request: DemoRequest): DemoResponse | null {
  if (!request.pathname.startsWith("/api/")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return {
      status: 204,
      headers: {
        ...responseHeaders(request.origin),
        "Access-Control-Allow-Headers": "Content-Type, X-Operator-Id",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      },
      body: ""
    };
  }

  if (request.method === "GET" && request.pathname === "/api/ops/summary") {
    return handleSummary(request);
  }

  if (request.method === "GET" && request.pathname === "/api/cargo/search") {
    return handleCargoSearch(request);
  }

  if (request.method === "POST" && request.pathname === "/api/auth/login") {
    return handleLogin(request);
  }

  if (request.method === "GET" && request.pathname.startsWith("/api/billing/invoices/")) {
    return handleInvoice(request);
  }

  if (request.method === "GET" && request.pathname === "/api/files/read") {
    return handleFileRead(request);
  }

  if (request.method === "POST" && request.pathname === "/api/integrations/preview") {
    return handleIntegrationPreview(request);
  }

  if (request.method === "POST" && request.pathname === "/api/operators/profile") {
    return handleProfileUpdate(request);
  }

  if (request.method === "GET" && request.pathname === "/api/support/preview") {
    return handleSupportPreview(request);
  }

  return jsonResponse({
    status: 404,
    origin: request.origin,
    data: { error: "Route not found." }
  });
}
