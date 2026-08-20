import { useState } from "react";
import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  ArrowRight,
  Bell,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  Headphones,
  KeyRound,
  Landmark,
  LogOut,
  Plug,
  ReceiptText,
  Search,
  Ship,
  UserRound,
  Warehouse
} from "lucide-react";
import {
  validateDocumentPath,
  validateFeedUrl,
  validateInvoiceId,
  validateLogin,
  validateProfile,
  validateShipmentQuery,
  validateSupportMessage
} from "./formValidation";

type ViewId =
  | "overview"
  | "shipments"
  | "billing"
  | "documents"
  | "integrations"
  | "support"
  | "account";

type Operator = Readonly<{
  id: string;
  name: string;
  role: string;
  terminal: string;
}>;

type AuthState =
  | Readonly<{ kind: "signedOut" }>
  | Readonly<{ kind: "submitting" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "signedIn"; operator: Operator }>;

type ApiState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "success"; status: number; body: unknown }>;

type ApiResult = Readonly<{ status: number; body: unknown }>;

type NavigationItem = Readonly<{
  id: ViewId;
  label: string;
  caption: string;
  icon: LucideIcon;
}>;

const NAVIGATION: readonly NavigationItem[] = [
  { id: "overview", label: "Overview", caption: "Morning window", icon: Gauge },
  { id: "shipments", label: "Shipments", caption: "Cargo registry", icon: Ship },
  { id: "billing", label: "Billing", caption: "Invoice desk", icon: ReceiptText },
  { id: "documents", label: "Documents", caption: "Port archive", icon: FileText },
  { id: "integrations", label: "Integrations", caption: "External feeds", icon: Plug },
  { id: "support", label: "Support", caption: "Customer notices", icon: Headphones },
  { id: "account", label: "Account", caption: "Operator profile", icon: UserRound }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(record: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function recordsField(record: Readonly<Record<string, unknown>>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function operatorFromBody(body: unknown): Operator | null {
  if (!isRecord(body)) {
    return null;
  }
  const user = recordField(body, "user");
  if (user === null) {
    return null;
  }

  const id = stringField(user, "id");
  const name = stringField(user, "name");
  const role = stringField(user, "role");
  const terminal = stringField(user, "terminal");
  if (id === null || name === null || role === null || terminal === null) {
    return null;
  }
  return { id, name, role, terminal };
}

function errorFromBody(body: unknown, fallback: string): string {
  if (!isRecord(body)) {
    return fallback;
  }
  return stringField(body, "error") ?? fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch {
    return { message: raw };
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(url, { ...init, credentials: "include" });
  return { status: response.status, body: await readJson(response) };
}

function money(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function titleFor(viewId: ViewId): string {
  return NAVIGATION.find((item) => item.id === viewId)?.label ?? "Overview";
}

function LoginScreen(props: Readonly<{
  auth: AuthState;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <main className="login-page">
      <section className="login-brand">
        <a className="wordmark wordmark-large" href="/" aria-label="Harborline">
          HARBOR<span>LINE</span>
        </a>
        <div className="brand-coordinate">40.7128 N / 74.0060 W</div>
        <div className="login-statement">
          <p>NORTH ATLANTIC OPERATIONS</p>
          <h1>Every handoff.<br />One clear line.</h1>
          <div className="brand-vessel" aria-hidden="true">
            <span className="vessel-line vessel-line-one" />
            <span className="vessel-line vessel-line-two" />
            <Anchor size={42} />
          </div>
        </div>
        <footer className="login-footer">
          <span>TERMINAL NAT-04</span>
          <span>DISPATCH BUILD 4.8.2</span>
        </footer>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="panel-monogram">HL</div>
          <p className="eyebrow">OPERATOR ACCESS</p>
          <h2>Start your shift</h2>
          <p className="login-copy">Use your Harborline operator ID to open the North Atlantic dispatch desk.</p>
          <form noValidate onSubmit={props.onSubmit}>
            <label htmlFor="operator-id">Operator ID</label>
            <div className="input-shell">
              <UserRound size={17} />
              <input
                id="operator-id"
                name="username"
                autoComplete="username"
                maxLength={32}
                value={props.username}
                onChange={(event) => props.onUsernameChange(event.currentTarget.value)}
              />
            </div>
            <label htmlFor="operator-password">Password</label>
            <div className="input-shell">
              <KeyRound size={17} />
              <input
                id="operator-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={72}
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.currentTarget.value)}
              />
            </div>
            {props.auth.kind === "error" ? <div className="form-error">{props.auth.message}</div> : null}
            <button className="primary-button login-button" type="submit" disabled={props.auth.kind === "submitting"}>
              {props.auth.kind === "submitting" ? "CHECKING ACCESS" : "OPEN DISPATCH"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="access-note">Authorized Harborline personnel only. Activity is logged against your operator ID.</p>
        </div>
      </section>
    </main>
  );
}

function EmptyState(props: Readonly<{ icon: LucideIcon; title: string; copy: string }>) {
  const Icon = props.icon;
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{props.title}</strong>
      <span>{props.copy}</span>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "signedOut" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [summary, setSummary] = useState<ApiState>({ kind: "idle" });
  const [viewState, setViewState] = useState<ApiState>({ kind: "idle" });
  const [shipmentQuery, setShipmentQuery] = useState("");
  const [invoiceId, setInvoiceId] = useState("INV-1007");
  const [documentPath, setDocumentPath] = useState("quarterly/manifest.txt");
  const [feedUrl, setFeedUrl] = useState("https://status.example.test/feed");
  const [supportMessage, setSupportMessage] = useState("Container arrived with a broken seal.");
  const [displayName, setDisplayName] = useState("Mira Chen");
  const [jobTitle, setJobTitle] = useState("Dispatch coordinator");

  async function loadSummary(): Promise<void> {
    setSummary({ kind: "loading" });
    try {
      const result = await requestJson("/api/ops/summary");
      setSummary({ kind: "success", ...result });
    } catch (error) {
      setSummary({
        kind: "error",
        message: error instanceof Error ? error.message : "Operations data is unavailable."
      });
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = validateLogin({ username, password });
    if (validation.kind === "invalid") {
      setAuth({ kind: "error", message: validation.message });
      return;
    }
    setAuth({ kind: "submitting" });
    try {
      const result = await requestJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const operator = operatorFromBody(result.body);
      if (result.status >= 400 || operator === null) {
        setAuth({ kind: "error", message: errorFromBody(result.body, "Access could not be verified.") });
        return;
      }
      setAuth({ kind: "signedIn", operator });
      setActiveView("overview");
      void loadSummary();
    } catch (error) {
      setAuth({
        kind: "error",
        message: error instanceof Error ? error.message : "Access could not be verified."
      });
    }
  }

  async function runViewRequest(url: string, init?: RequestInit): Promise<void> {
    setViewState({ kind: "loading" });
    try {
      const result = await requestJson(url, init);
      if (result.status >= 400) {
        setViewState({ kind: "error", message: errorFromBody(result.body, "The request could not be completed.") });
        return;
      }
      setViewState({ kind: "success", ...result });
    } catch (error) {
      setViewState({
        kind: "error",
        message: error instanceof Error ? error.message : "The request could not be completed."
      });
    }
  }

  function selectView(viewId: ViewId): void {
    setActiveView(viewId);
    setViewState({ kind: "idle" });
  }

  if (auth.kind !== "signedIn") {
    return (
      <LoginScreen
        auth={auth}
        username={username}
        password={password}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  const operator = auth.operator;
  const summaryBody = summary.kind === "success" && isRecord(summary.body) ? summary.body : null;
  const arrivals = summaryBody === null ? [] : recordsField(summaryBody, "arrivals");
  const resultBody = viewState.kind === "success" && isRecord(viewState.body) ? viewState.body : null;
  const cargoItems = resultBody === null ? [] : recordsField(resultBody, "items");
  const hasInternalCargo = cargoItems.some(
    (item) => numberField(item, "internalRate") !== null || stringField(item, "clientToken") !== null
  );
  const invoice = resultBody === null ? null : recordField(resultBody, "invoice");
  const profile = resultBody === null ? null : recordField(resultBody, "profile");
  const supportPreview = resultBody === null ? null : stringField(resultBody, "previewHtml");

  function viewContent() {
    switch (activeView) {
      case "overview":
        return (
          <>
            <section className="page-heading overview-heading">
              <div>
                <p className="eyebrow">WEDNESDAY / AUGUST 19</p>
                <h1>Morning window</h1>
                <p>North Atlantic freight desk. Live position as of 08:30 EDT.</p>
              </div>
              <div className="weather-block">
                <span>NEWARK HARBOR</span>
                <strong>72°F</strong>
                <small>SW 11 KT / CLEAR</small>
              </div>
            </section>

            <section className="metrics-grid">
              <article className="metric-card metric-dark">
                <span>ACTIVE SHIPMENTS</span>
                <strong>{summaryBody === null ? "--" : numberField(summaryBody, "activeShipments")}</strong>
                <small>6 entered port today</small>
                <Ship size={24} />
              </article>
              <article className="metric-card">
                <span>ON-TIME RATE</span>
                <strong>{summaryBody === null ? "--" : `${numberField(summaryBody, "onTimeRate")}%`}</strong>
                <small>+1.4 points this week</small>
              </article>
              <article className="metric-card metric-signal">
                <span>CUSTOMS HOLDS</span>
                <strong>{summaryBody === null ? "--" : numberField(summaryBody, "customsHolds")}</strong>
                <small>One needs action</small>
              </article>
              <article className="metric-card">
                <span>OPEN INVOICES</span>
                <strong>{summaryBody === null ? "--" : numberField(summaryBody, "openInvoices")}</strong>
                <small>2 due this week</small>
              </article>
            </section>

            <section className="overview-grid">
              <article className="route-board">
                <div className="section-heading">
                  <div>
                    <span>ROUTE BOARD</span>
                    <h2>North Atlantic</h2>
                  </div>
                  <span className="status-chip">LIVE</span>
                </div>
                <div className="route-map" aria-label="North Atlantic route map">
                  <span className="map-grid-line map-line-one" />
                  <span className="map-grid-line map-line-two" />
                  <span className="route-path route-path-one" />
                  <span className="route-path route-path-two" />
                  <span className="route-node node-newark"><i />NEWARK</span>
                  <span className="route-node node-reykjavik"><i />REYKJAVIK</span>
                  <span className="route-node node-rotterdam"><i />ROTTERDAM</span>
                  <Ship className="ship-mark ship-one" size={19} />
                  <Ship className="ship-mark ship-two" size={17} />
                  <div className="map-coordinate">NAT / 42.8°N / 36.2°W</div>
                </div>
              </article>

              <article className="arrivals-card">
                <div className="section-heading">
                  <div>
                    <span>NEXT ARRIVALS</span>
                    <h2>Inbound</h2>
                  </div>
                  <Clock3 size={19} />
                </div>
                <div className="arrival-list">
                  {arrivals.map((arrival, index) => (
                    <div className="arrival-row" key={`${stringField(arrival, "vessel")}-${index}`}>
                      <span className="arrival-index">0{index + 1}</span>
                      <div>
                        <strong>{stringField(arrival, "vessel")}</strong>
                        <small>{stringField(arrival, "port")} / {stringField(arrival, "status")}</small>
                      </div>
                      <time>{stringField(arrival, "eta")}</time>
                    </div>
                  ))}
                  {summary.kind === "loading" ? <div className="inline-loading">Updating arrivals...</div> : null}
                </div>
                <button className="text-button" type="button" onClick={() => selectView("shipments")}>
                  View cargo registry <ArrowRight size={15} />
                </button>
              </article>
            </section>

            <section className="attention-strip">
              <div><span>01</span><strong>Needs attention</strong></div>
              <p>HL-2048 is waiting on a commercial invoice before the 14:00 customs review.</p>
              <button type="button" onClick={() => {
                setShipmentQuery("Orion");
                selectView("shipments");
              }}>Open shipment <ChevronRight size={16} /></button>
            </section>
          </>
        );

      case "shipments":
        return (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">CARGO REGISTRY</p>
                <h1>Shipments</h1>
                <p>Find active cargo by client or route.</p>
              </div>
              <div className="heading-stat"><strong>42</strong><span>ACTIVE</span></div>
            </section>
            <section className="work-card">
              <form className="search-form" noValidate onSubmit={(event) => {
                event.preventDefault();
                const validation = validateShipmentQuery(shipmentQuery);
                if (validation.kind === "invalid") {
                  setViewState({ kind: "error", message: validation.message });
                  return;
                }
                void runViewRequest(`/api/cargo/search?q=${encodeURIComponent(shipmentQuery)}`);
              }}>
                <label htmlFor="shipment-query">Client or route</label>
                <div className="large-input-row">
                  <div className="input-shell light-input">
                    <Search size={18} />
                    <input
                      id="shipment-query"
                      value={shipmentQuery}
                      maxLength={60}
                      placeholder="Orion Machine Works"
                      onChange={(event) => setShipmentQuery(event.currentTarget.value)}
                    />
                  </div>
                  <button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Search</button>
                </div>
              </form>
              {viewState.kind === "idle" ? <EmptyState icon={Ship} title="Search the cargo registry" copy="Use a client name or one of the active routes." /> : null}
              {viewState.kind === "loading" ? <div className="inline-loading tall-loading">Searching cargo...</div> : null}
              {viewState.kind === "error" ? <div className="form-error card-error">{viewState.message}</div> : null}
              {viewState.kind === "success" ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Shipment</th><th>Client</th><th>Route</th><th>Status</th><th>ETA</th>{hasInternalCargo ? <><th>Rate</th><th>Client ref</th></> : null}</tr></thead>
                    <tbody>
                      {cargoItems.map((item) => (
                        <tr key={stringField(item, "id") ?? "shipment"}>
                          <td><strong>{stringField(item, "id")}</strong></td>
                          <td>{stringField(item, "client")}</td>
                          <td>{stringField(item, "route")}</td>
                          <td><span className="table-status">{stringField(item, "status")}</span></td>
                          <td>{stringField(item, "eta")}</td>
                          {hasInternalCargo ? <><td>{money(numberField(item, "internalRate"))}</td><td><code>{stringField(item, "clientToken")}</code></td></> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cargoItems.length === 0 ? <div className="no-results">No shipments matched your search.</div> : null}
                </div>
              ) : null}
            </section>
          </>
        );

      case "billing":
        return (
          <>
            <section className="page-heading">
              <div><p className="eyebrow">ACCOUNTS RECEIVABLE</p><h1>Invoice desk</h1><p>Review billing records attached to your customer account.</p></div>
              <div className="heading-stat"><strong>07</strong><span>OPEN</span></div>
            </section>
            <section className="split-workspace">
              <article className="work-card compact-card">
                <form noValidate onSubmit={(event) => {
                  event.preventDefault();
                  const validation = validateInvoiceId(invoiceId);
                  if (validation.kind === "invalid") {
                    setViewState({ kind: "error", message: validation.message });
                    return;
                  }
                  void runViewRequest(`/api/billing/invoices/${encodeURIComponent(invoiceId)}`, {
                    headers: { "X-Operator-Id": operator.id }
                  });
                }}>
                  <label htmlFor="invoice-id">Invoice number</label>
                  <div className="large-input-row">
                    <div className="input-shell light-input"><ReceiptText size={18} /><input id="invoice-id" value={invoiceId} maxLength={8} onChange={(event) => setInvoiceId(event.currentTarget.value)} /></div>
                    <button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Open</button>
                  </div>
                </form>
                <div className="recent-list"><span>RECENT</span><button type="button" onClick={() => setInvoiceId("INV-1007")}><ReceiptText size={16} />INV-1007<small>Orion Machine Works</small></button></div>
              </article>
              <article className="document-card">
                {viewState.kind === "idle" ? <EmptyState icon={Landmark} title="No invoice selected" copy="Enter an invoice number to review the billing record." /> : null}
                {viewState.kind === "loading" ? <div className="inline-loading tall-loading">Opening invoice...</div> : null}
                {viewState.kind === "error" ? <div className="form-error card-error">{viewState.message}</div> : null}
                {invoice !== null ? (
                  <div className="invoice-sheet">
                    <div className="invoice-top"><span>HARBORLINE FREIGHT</span><strong>{stringField(invoice, "id")}</strong></div>
                    <h2>{stringField(invoice, "customer")}</h2>
                    <div className="invoice-grid"><span>ACCOUNT<strong>{stringField(invoice, "accountId")}</strong></span><span>ISSUED<strong>{stringField(invoice, "issued")}</strong></span><span>DUE<strong>{stringField(invoice, "due")}</strong></span><span>STATUS<strong>{stringField(invoice, "status")}</strong></span></div>
                    <div className="invoice-total"><span>TOTAL DUE</span><strong>{money(numberField(invoice, "total"))}</strong></div>
                    <div className="bank-reference">BANK REFERENCE <code>{stringField(invoice, "bankReference")}</code></div>
                  </div>
                ) : null}
              </article>
            </section>
          </>
        );

      case "documents":
        return (
          <>
            <section className="page-heading"><div><p className="eyebrow">PORT ARCHIVE</p><h1>Documents</h1><p>Open manifests and operating notices shared with your terminal.</p></div></section>
            <section className="split-workspace">
              <article className="work-card compact-card">
                <form noValidate onSubmit={(event) => {
                  event.preventDefault();
                  const validation = validateDocumentPath(documentPath);
                  if (validation.kind === "invalid") {
                    setViewState({ kind: "error", message: validation.message });
                    return;
                  }
                  void runViewRequest(`/api/files/read?path=${encodeURIComponent(documentPath)}`);
                }}>
                  <label htmlFor="document-path">Document path</label>
                  <div className="large-input-row"><div className="input-shell light-input"><FileText size={18} /><input id="document-path" value={documentPath} maxLength={40} onChange={(event) => setDocumentPath(event.currentTarget.value)} /></div><button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Open</button></div>
                </form>
                <div className="recent-list"><span>SHARED WITH NAT-04</span><button type="button" onClick={() => setDocumentPath("quarterly/manifest.txt")}><FileText size={16} />Q3 manifest<small>quarterly/manifest.txt</small></button><button type="button" onClick={() => setDocumentPath("briefs/port-notice.txt")}><FileText size={16} />Port notice<small>briefs/port-notice.txt</small></button></div>
              </article>
              <article className="document-card">
                {viewState.kind === "idle" ? <EmptyState icon={FileText} title="Choose a document" copy="Open a file from the shared archive." /> : null}
                {viewState.kind === "loading" ? <div className="inline-loading tall-loading">Opening document...</div> : null}
                {viewState.kind === "error" ? <div className="form-error card-error">{viewState.message}</div> : null}
                {resultBody !== null && stringField(resultBody, "contents") !== null ? <div className="file-sheet"><div><span>{stringField(resultBody, "path")}</span><time>{stringField(resultBody, "updatedAt")}</time></div><h2>{stringField(resultBody, "name")}</h2><pre>{stringField(resultBody, "contents")}</pre></div> : null}
              </article>
            </section>
          </>
        );

      case "integrations":
        return (
          <>
            <section className="page-heading"><div><p className="eyebrow">EXTERNAL FEEDS</p><h1>Integrations</h1><p>Preview a partner status feed before you add it to the dispatch board.</p></div><div className="heading-stat"><strong>03</strong><span>CONNECTED</span></div></section>
            <section className="work-card">
              <form noValidate onSubmit={(event) => {
                event.preventDefault();
                const validation = validateFeedUrl(feedUrl);
                if (validation.kind === "invalid") {
                  setViewState({ kind: "error", message: validation.message });
                  return;
                }
                void runViewRequest("/api/integrations/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: feedUrl }) });
              }}>
                <label htmlFor="feed-url">Feed URL</label>
                <div className="large-input-row"><div className="input-shell light-input"><Plug size={18} /><input id="feed-url" value={feedUrl} maxLength={200} onChange={(event) => setFeedUrl(event.currentTarget.value)} /></div><button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Preview feed</button></div>
              </form>
              {viewState.kind === "idle" ? <EmptyState icon={Plug} title="No preview loaded" copy="Enter a JSON feed URL to inspect its current response." /> : null}
              {viewState.kind === "loading" ? <div className="inline-loading tall-loading">Contacting feed...</div> : null}
              {viewState.kind === "error" ? <div className="form-error card-error">{viewState.message}</div> : null}
              {resultBody !== null && recordField(resultBody, "data") !== null ? <div className="feed-preview"><div><span className="status-chip">{numberField(resultBody, "status")}</span><code>{stringField(resultBody, "url")}</code></div><pre>{JSON.stringify(recordField(resultBody, "data"), null, 2)}</pre></div> : null}
            </section>
          </>
        );

      case "support":
        return (
          <>
            <section className="page-heading"><div><p className="eyebrow">CUSTOMER SERVICE</p><h1>Notice composer</h1><p>Preview the update before it is added to a shipment record.</p></div></section>
            <section className="composer-grid">
              <form className="work-card" noValidate onSubmit={(event) => {
                event.preventDefault();
                const validation = validateSupportMessage(supportMessage);
                if (validation.kind === "invalid") {
                  setViewState({ kind: "error", message: validation.message });
                  return;
                }
                void runViewRequest(`/api/support/preview?message=${encodeURIComponent(supportMessage)}`);
              }}>
                <label htmlFor="support-message">Customer update</label>
                <textarea id="support-message" rows={9} maxLength={500} value={supportMessage} onChange={(event) => setSupportMessage(event.currentTarget.value)} />
                <button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Refresh preview</button>
              </form>
              <article className="notice-preview">
                <span>MESSAGE PREVIEW</span>
                <div className="notice-brand"><span>HARBOR<span>LINE</span></span><small>Shipment update</small></div>
                {viewState.kind === "loading" ? <div className="inline-loading">Preparing preview...</div> : null}
                {viewState.kind === "error" ? <div className="form-error card-error">{viewState.message}</div> : null}
                {supportPreview === null ? <p className="preview-placeholder">Your customer-facing message appears here.</p> : <div className="customer-message" dangerouslySetInnerHTML={{ __html: supportPreview }} />}
                <div className="notice-footer">Harborline North Atlantic Operations</div>
              </article>
            </section>
          </>
        );

      case "account":
        return (
          <>
            <section className="page-heading"><div><p className="eyebrow">OPERATOR ACCOUNT</p><h1>Profile</h1><p>Keep your name and dispatch title current for customer notices.</p></div></section>
            <section className="profile-grid">
              <article className="profile-summary">
                <div className="profile-avatar">MC</div>
                <h2>{profile === null ? operator.name : stringField(profile, "displayName")}</h2>
                <p>{profile === null ? jobTitle : stringField(profile, "jobTitle")}</p>
                <dl><div><dt>Operator ID</dt><dd>{operator.id}</dd></div><div><dt>Terminal</dt><dd>{operator.terminal}</dd></div><div><dt>Access tier</dt><dd>{profile === null ? operator.role : stringField(profile, "role")}</dd></div>{profile !== null ? <div><dt>Clearance</dt><dd>{numberField(profile, "clearance")}</dd></div> : null}</dl>
              </article>
              <form className="work-card profile-form" noValidate onSubmit={(event) => {
                event.preventDefault();
                const validation = validateProfile({ displayName, jobTitle });
                if (validation.kind === "invalid") {
                  setViewState({ kind: "error", message: validation.message });
                  return;
                }
                void runViewRequest("/api/operators/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, jobTitle }) });
              }}>
                <h2>Public details</h2>
                <p>These fields appear on notices that you send from Harborline.</p>
                <label htmlFor="display-name">Display name</label><div className="input-shell light-input"><UserRound size={18} /><input id="display-name" value={displayName} maxLength={60} onChange={(event) => setDisplayName(event.currentTarget.value)} /></div>
                <label htmlFor="job-title">Job title</label><div className="input-shell light-input"><Warehouse size={18} /><input id="job-title" value={jobTitle} maxLength={80} onChange={(event) => setJobTitle(event.currentTarget.value)} /></div>
                {viewState.kind === "error" ? <div className="form-error">{viewState.message}</div> : null}
                {viewState.kind === "success" ? <div className="save-confirmation">Profile saved.</div> : null}
                <button className="primary-button" type="submit" disabled={viewState.kind === "loading"}>Save profile</button>
              </form>
            </section>
          </>
        );

      default: {
        const exhaustive: never = activeView;
        throw new Error(`Unhandled view: ${exhaustive}`);
      }
    }
  }

  return (
    <div className="portal-shell">
      <header className="topbar">
        <a className="wordmark" href="#main" aria-label="Harborline home">HARBOR<span>LINE</span></a>
        <div className="topbar-route"><Anchor size={15} /><span>NORTH ATLANTIC</span><strong>NAT-04</strong></div>
        <div className="topbar-actions">
          <button className="header-icon" type="button" aria-label="Notifications"><Bell size={18} /><i /></button>
          <div className="operator-chip"><span>MC</span><div><strong>{operator.name}</strong><small>{operator.role}</small></div></div>
          <button className="header-icon" type="button" aria-label="Sign out" onClick={() => { setAuth({ kind: "signedOut" }); setPassword(""); }}><LogOut size={18} /></button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="Harborline sections">
          {NAVIGATION.map((item, index) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button className={active ? "is-active" : ""} type="button" key={item.id} aria-current={active ? "page" : undefined} onClick={() => selectView(item.id)}>
                <span className="nav-index">0{index + 1}</span><Icon size={18} /><span><strong>{item.label}</strong><small>{item.caption}</small></span><ChevronRight className="nav-arrow" size={15} />
              </button>
            );
          })}
        </nav>
        <div className="terminal-card"><span>TERMINAL LOAD</span><strong>68%</strong><div><i /></div><small>Normal operating range</small></div>
      </aside>

      <main className="portal-main" id="main">
        <div className="mobile-title">{titleFor(activeView)}</div>
        <div className="content-frame">{viewContent()}</div>
      </main>
    </div>
  );
}
