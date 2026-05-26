import { describe, expect, it } from "vitest";
import { resultPreview } from "./resultPreview";

describe("resultPreview", () => {
  it("returns error text for failed runs", () => {
    expect(resultPreview({ ok: false, auditId: "a1", error: "boom" })).toBe("boom");
  });

  it("formats capture summary", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "capture_summary",
        data: { summary: "Summary", observations: ["obs"], uncertainties: ["unk"] }
      }
    });
    expect(text).toContain("Summary");
    expect(text).toContain("- obs");
  });

  it("formats repeater drafts", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "repeater_drafts",
        data: {
          drafts: [{ label: "Draft", rationale: "Why", draft: { method: "GET", url: "http://localhost", headers: {}, body: "" } }]
        }
      }
    });
    expect(text).toContain("1. Draft");
    expect(text).toContain("GET http://localhost");
  });

  it("formats scope checklist", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: { task: "scope_checklist", data: { items: [{ title: "Check auth", steps: ["Try logout"] }] } }
    });
    expect(text).toContain("Check auth");
    expect(text).toContain("- Try logout");
  });

  it("formats report notes", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "report_notes",
        data: { notes: "Notes", evidenceRefs: ["capture:1"], uncertainties: ["maybe"] }
      }
    });
    expect(text).toContain("Notes");
    expect(text).toContain("- capture:1");
  });

  it("formats browser helper steps", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "browser_helper",
        data: { steps: [{ label: "Open home", action: "navigate", url: "http://localhost" }] }
      }
    });
    expect(text).toContain("[navigate] Open home");
    expect(text).toContain("http://localhost");
  });

  it("formats tls review output", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "tls_review",
        data: { summary: "Mixed trust", findings: ["blocked localhost"], recommendations: ["install CA"] }
      }
    });
    expect(text).toContain("Mixed trust");
    expect(text).toContain("- blocked localhost");
  });

  it("formats custom skill output", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      output: {
        task: "custom",
        data: { skillId: "skill-1", label: "Header diff", text: "Auth header changed" }
      }
    });
    expect(text).toBe("Auth header changed");
  });

  it("falls back to raw text for unknown output tasks", () => {
    const text = resultPreview({
      ok: true,
      auditId: "a1",
      rawText: "raw fallback",
      output: { task: "unknown" as "capture_summary", data: { summary: "", observations: [], uncertainties: [] } }
    });
    expect(text).toBe("raw fallback");
  });
});
