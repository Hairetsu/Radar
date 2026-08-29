import type { AgentToolResult } from "../../../shared/agent-types.js";
import { isAllowedTarget } from "../../../shared/allowlist.js";
import {
  clientOverrideFromCapture,
  isOverridableClientCapture,
  relaxClientValidation,
  summarizeClientOverride
} from "../../../shared/clientOverrides.js";
import { normalizeDraft } from "../../../shared/draft.js";
import { buildSitemap } from "../../../shared/sitemap.js";
import { parseTrafficQuery } from "../../../shared/trafficQuery.js";
import {
  analyzeCookieFlags,
  analyzeSecurityHeaders,
  checkCorsPolicy,
  responseDraftFromIntercept,
  runCaptures
} from "../evidenceContext.js";
import type { AgentToolFamilyExecutor } from "./types.js";

export const executeEvidenceTool: AgentToolFamilyExecutor = async ({ run, call, deps }) => {
  let result: AgentToolResult;
  switch (call.tool) {
        case "getCaptures":
          {
            const activeAllowlist = deps.allowlist();
            const targetOrigin = String(call.input.targetOrigin || "").trim();
            const captures = runCaptures(run, deps.getCaptures(), activeAllowlist, targetOrigin);
            result = {
              tool: call.tool,
              ok: true,
              data: { captures: captures.slice(0, call.input.limit || run.policy.maxCaptureSample) }
            };
          }
          break;
        case "getInterceptQueue": {
          const state = deps.getInterceptState();
          result = {
            tool: call.tool,
            ok: true,
            data: { queue: state.queue.slice(0, call.input.limit || run.policy.maxCaptureSample) }
          };
          break;
        }
        case "getClientOverrides": {
          result = {
            tool: call.tool,
            ok: true,
            data: {
              overrides: deps.getClientOverrides().slice(0, call.input.limit || 20).map(summarizeClientOverride)
            }
          };
          break;
        }
        case "applyClientValidationBypass": {
          const capture = deps.getCaptureById?.(call.input.captureId);
          if (!capture) {
            throw new Error("Capture was not found.");
          }
          if (!capture.allowed || !isAllowedTarget(capture.url, deps.allowlist())) {
            throw new Error(`Client file override is out of scope: ${capture.url}`);
          }
          if (!isOverridableClientCapture(capture)) {
            throw new Error("Capture is not an editable HTML, JavaScript, or CSS client file.");
          }
          const created = clientOverrideFromCapture(capture);
          if (!created) {
            throw new Error("Could not create a client file override from this capture.");
          }
          const relaxed = relaxClientValidation(created.body);
          if (relaxed.changes.length === 0) {
            throw new Error("No client validation constraints were found in this file.");
          }
          const override = {
            ...created,
            name: call.input.name || created.name,
            body: relaxed.body,
            relaxApplied: true
          };
          const existing = deps.getClientOverrides().filter(
            (item) => !(item.host === override.host && item.path === override.path)
          );
          const saved = deps.setClientOverrides([...existing, override]);
          const current = saved.find((item) => item.host === override.host && item.path === override.path) || override;
          result = {
            tool: call.tool,
            ok: true,
            data: {
              override: current,
              changes: relaxed.changes,
              note: `${relaxed.changes.join(". ")}. Reload the Radar Browser to deliver the edited file.`
            }
          };
          break;
        }
        case "prepareInterceptEdit": {
          const state = deps.getInterceptState();
          const item = state.queue.find((entry) => entry.id === call.input.id);
          if (!item) {
            throw new Error("Intercept queue item was not found.");
          }
          if (item.stage === "response") {
            const response = responseDraftFromIntercept(call.input.response || {}, {
              status: item.status || 200,
              statusText: item.statusText || "",
              headers: item.headers,
              body: item.body
            });
            result = {
              tool: call.tool,
              ok: true,
              data: { item, response, note: call.input.note || "Prepared response edit for operator review." }
            };
          } else {
            const draft = normalizeDraft(call.input.draft || item);
            if (!isAllowedTarget(draft.url, deps.allowlist())) {
              throw new Error(`Prepared intercept URL is out of scope: ${draft.url}`);
            }
            result = {
              tool: call.tool,
              ok: true,
              data: { item, draft, note: call.input.note || "Prepared request edit for operator review." }
            };
          }
          break;
        }
        case "analyzeSecurityHeaders": {
          const captures = runCaptures(run, deps.getCaptures(), deps.allowlist(), call.input.targetOrigin || "");
          result = { tool: call.tool, ok: true, data: { observations: analyzeSecurityHeaders(captures) } };
          break;
        }
        case "analyzeCookieFlags": {
          const captures = runCaptures(run, deps.getCaptures(), deps.allowlist(), call.input.targetOrigin || "");
          result = { tool: call.tool, ok: true, data: { observations: analyzeCookieFlags(captures) } };
          break;
        }
        case "checkCorsPolicy": {
          const captures = runCaptures(run, deps.getCaptures(), deps.allowlist(), call.input.targetOrigin || "");
          result = { tool: call.tool, ok: true, data: { observations: checkCorsPolicy(captures) } };
          break;
        }
        case "getSitemapCoverage": {
          const captures = runCaptures(run, deps.getCaptures(), deps.allowlist(), "");
          const sitemap = buildSitemap(captures);
          const limit = call.input.limit || 12;
          const hosts = sitemap.roots.slice(0, limit).map((hostId) => {
            const hostNode = sitemap.nodes[hostId];
            return {
              host: hostNode?.host || hostId,
              requestCount: hostNode?.requestCount || 0,
              paths: (hostNode?.childIds || [])
                .slice(0, 8)
                .map((pathId) => sitemap.nodes[pathId]?.path || pathId)
            };
          });
          const endpointCount = Object.values(sitemap.nodes).filter((node) => node.kind === "endpoint").length;
          result = {
            tool: call.tool,
            ok: true,
            data: {
              hostCount: sitemap.roots.length,
              endpointCount,
              hosts,
              suggestedQueries: hosts.flatMap((host) => [
                `host:${host.host}`,
                `host:${host.host} status:4xx`
              ]).slice(0, 8)
            }
          };
          break;
        }
        case "prepareTrafficQuery": {
          const parsed = parseTrafficQuery(call.input.query);
          if (!parsed.ok) {
            throw new Error(parsed.error);
          }
          result = {
            tool: call.tool,
            ok: true,
            data: {
              query: call.input.query,
              reason: call.input.reason || "Prepared traffic query for operator review."
            }
          };
          break;
        }
    default:
      return null;
  }
  return result;
};

