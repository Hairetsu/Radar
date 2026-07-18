import type { AiSettings, AiTaskOutput, AiTaskType } from "../../shared/ai-types.js";
import { runCodexCliCompletion } from "./codexCli.js";
import { runCursorCliCompletion } from "./cursorCli.js";

export function extractJson(text: string) {
  const trimmed = String(text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

async function callOpenAi({
  apiKey,
  model,
  baseUrl,
  system,
  user
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  system: string;
  user: string;
}) {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${root}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(4_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `OpenAI-compatible request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response.");
  }
  return { text: content, parsed: extractJson(content) };
}

async function callAnthropic({
  apiKey,
  model,
  system,
  user
}: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(4_000),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Anthropic request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const block = payload?.content?.find((item) => item.type === "text");
  const content = block?.text;
  if (!content) {
    throw new Error("Empty model response.");
  }
  return { text: content, parsed: extractJson(content) };
}

export async function complete({
  settings,
  system,
  user
}: {
  settings: AiSettings;
  system: string;
  user: string;
}) {
  if (settings.provider === "codex-local") {
    const text = await runCodexCliCompletion({
      model: settings.model,
      system,
      user
    });
    return { text, parsed: extractJson(text) };
  }

  if (settings.provider === "cursor-local") {
    const text = await runCursorCliCompletion({
      model: settings.model,
      apiKey: settings.apiKey,
      system,
      user
    });
    return { text, parsed: extractJson(text) };
  }

  if (!settings.apiKey?.trim()) {
    throw new Error("AI API key is not configured.");
  }

  if (settings.provider === "anthropic") {
    return callAnthropic({
      apiKey: settings.apiKey,
      model: settings.model,
      system,
      user
    });
  }

  const baseUrl =
    settings.provider === "openai-compatible" ? settings.baseUrl : "https://api.openai.com/v1";

  return callOpenAi({
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl,
    system,
    user
  });
}

export function normalizeOutput(
  task: AiTaskType | "custom",
  parsed: Record<string, unknown>,
  customMeta?: { skillId: string; label: string }
): AiTaskOutput {
  switch (task) {
    case "capture_summary":
      return {
        task,
        data: {
          summary: String(parsed.summary || ""),
          observations: Array.isArray(parsed.observations) ? parsed.observations.map(String) : [],
          uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : []
        }
      };
    case "repeater_drafts": {
      const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
      return {
        task,
        data: {
          drafts: drafts.map((item) => {
            const draft = item as Record<string, unknown>;
            const draftBody = draft.draft as Record<string, unknown> | undefined;
            return {
              label: String(draft.label || "Draft"),
              rationale: String(draft.rationale || ""),
              draft: {
                method: String(draftBody?.method || "GET"),
                url: String(draftBody?.url || ""),
                headers:
                  draftBody?.headers && typeof draftBody.headers === "object"
                    ? Object.fromEntries(
                        Object.entries(draftBody.headers as Record<string, unknown>).map(([key, value]) => [
                          key,
                          String(value)
                        ])
                      )
                    : {},
                body: String(draftBody?.body || "")
              }
            };
          })
        }
      };
    }
    case "scope_checklist": {
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      return {
        task,
        data: {
          items: items.map((item) => {
            const entry = item as Record<string, unknown>;
            return {
              title: String(entry.title || ""),
              steps: Array.isArray(entry.steps) ? entry.steps.map(String) : []
            };
          })
        }
      };
    }
    case "report_notes":
      return {
        task,
        data: {
          notes: String(parsed.notes || ""),
          evidenceRefs: Array.isArray(parsed.evidenceRefs) ? parsed.evidenceRefs.map(String) : [],
          uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : []
        }
      };
    case "browser_helper": {
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      return {
        task,
        data: {
          steps: steps.map((item) => {
            const step = item as Record<string, unknown>;
            return {
              label: String(step.label || ""),
              action: step.action === "navigate" ? "navigate" : "observe",
              url: step.url ? String(step.url) : undefined
            };
          })
        }
      };
    }
    case "tls_review":
      return {
        task,
        data: {
          summary: String(parsed.summary || ""),
          findings: Array.isArray(parsed.findings) ? parsed.findings.map(String) : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : []
        }
      };
    case "custom":
      return {
        task,
        data: {
          skillId: customMeta?.skillId || String(parsed.skillId || ""),
          label: customMeta?.label || String(parsed.label || "Custom skill"),
          text: String(parsed.text || parsed.summary || "")
        }
      };
    default:
      throw new Error(`Unknown AI task: ${task}`);
  }
}
