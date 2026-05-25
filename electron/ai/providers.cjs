function extractJson(text) {
  const trimmed = String(text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenAi({ apiKey, model, baseUrl, system, user }) {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${root}/chat/completions`, {
    method: "POST",
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

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response.");
  }
  return { text: content, parsed: extractJson(content) };
}

async function callAnthropic({ apiKey, model, system, user }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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

  const payload = await response.json();
  const block = payload?.content?.find((item) => item.type === "text");
  const content = block?.text;
  if (!content) {
    throw new Error("Empty model response.");
  }
  return { text: content, parsed: extractJson(content) };
}

async function complete({ settings, system, user }) {
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

function normalizeOutput(task, parsed) {
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
    case "repeater_drafts":
      return {
        task,
        data: {
          drafts: Array.isArray(parsed.drafts)
            ? parsed.drafts.map((item) => ({
                label: String(item.label || "Draft"),
                rationale: String(item.rationale || ""),
                draft: {
                  method: String(item.draft?.method || "GET"),
                  url: String(item.draft?.url || ""),
                  headers:
                    item.draft?.headers && typeof item.draft.headers === "object"
                      ? Object.fromEntries(
                          Object.entries(item.draft.headers).map(([k, v]) => [k, String(v)])
                        )
                      : {},
                  body: String(item.draft?.body || "")
                }
              }))
            : []
        }
      };
    case "scope_checklist":
      return {
        task,
        data: {
          items: Array.isArray(parsed.items)
            ? parsed.items.map((item) => ({
                title: String(item.title || ""),
                steps: Array.isArray(item.steps) ? item.steps.map(String) : []
              }))
            : []
        }
      };
    case "report_notes":
      return {
        task,
        data: {
          notes: String(parsed.notes || ""),
          evidenceRefs: Array.isArray(parsed.evidenceRefs) ? parsed.evidenceRefs.map(String) : [],
          uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : []
        }
      };
    case "browser_helper":
      return {
        task,
        data: {
          steps: Array.isArray(parsed.steps)
            ? parsed.steps.map((item) => ({
                label: String(item.label || ""),
                action: item.action === "navigate" ? "navigate" : "observe",
                url: item.url ? String(item.url) : undefined
              }))
            : []
        }
      };
    default:
      throw new Error(`Unknown AI task: ${task}`);
  }
}

module.exports = { complete, normalizeOutput, extractJson };
