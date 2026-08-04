import type { AgentWorkbenchView } from "../../../shared/agent-types.js";

export type WorkView = AgentWorkbenchView;

export const WORK_VIEWS: WorkView[] = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "findings",
  "workflows",
  "plugins",
  "advanced",
  "sitemap",
  "scope",
  "ssl"
];

export const viewMeta: Record<WorkView, { num: string; label: string; eyebrow: string; title: string }> = {
  traffic: { num: "01", label: "HTTP(S)", eyebrow: "HTTP / HTTPS // Request capture", title: "HTTP / HTTPS Traffic" },
  websocket: { num: "02", label: "WebSocket", eyebrow: "Streams // Frame analysis", title: "WebSocket" },
  intercept: { num: "03", label: "Intercept", eyebrow: "Proxy // Pause and mutate", title: "Intercept" },
  repeater: { num: "04", label: "Repeater", eyebrow: "Replay // Surface probe", title: "Repeater" },
  automate: { num: "05", label: "Automate", eyebrow: "Payloads // Bounded runs", title: "Automate" },
  findings: { num: "06", label: "Findings", eyebrow: "Evidence // Report builder", title: "Findings" },
  workflows: { num: "07", label: "Workflows", eyebrow: "Checks // Repeatable runs", title: "Workflows" },
  plugins: { num: "08", label: "Plugins", eyebrow: "SDK // Local extensions", title: "Plugins" },
  advanced: { num: "09", label: "Advanced", eyebrow: "API // Auth and data signals", title: "Advanced Testing" },
  sitemap: { num: "10", label: "Sitemap", eyebrow: "Map // Endpoint inventory", title: "Sitemap" },
  scope: { num: "11", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "12", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
};
