import { describe, expect, it } from "vitest";
import { pickValidModel, sanitizeModelId, sanitizeModelOption, stripAnsi } from "./ai-models.js";

describe("ai-models", () => {
  it("strips ansi codes from model ids", () => {
    expect(sanitizeModelId("\u001b[36mgpt-5.3-codex\u001b[39m")).toBe("gpt-5.3-codex");
  });

  it("strips orphaned bracket ansi codes", () => {
    expect(sanitizeModelId("[36MGPT-5.5-EXTRA-HIGH [39M")).toBe("GPT-5.5-EXTRA-HIGH");
    expect(sanitizeModelId("[36mauto[39m")).toBe("auto");
  });

  it("strips ansi without collapsing newlines", () => {
    expect(stripAnsi("\u001b[36mauto\u001b[39m\n\u001b[36mgpt-5.3-codex\u001b[39m")).toBe("auto\ngpt-5.3-codex");
  });

  it("sanitizes model options", () => {
    expect(sanitizeModelOption({ id: "[36mauto[39m", label: "[36mauto[39m" })).toEqual({
      id: "auto",
      label: "auto"
    });
    expect(sanitizeModelOption({ id: "auto", label: "[36m[39m" })).toEqual({
      id: "auto",
      label: "auto"
    });
  });

  it("matches requested models with ansi codes", () => {
    expect(
      pickValidModel("[36mgpt-5.3-codex[39m", [
        { id: "auto", label: "auto" },
        { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
      ])
    ).toBe("gpt-5.3-codex");
  });

  it("returns auto when no models are available", () => {
    expect(pickValidModel("", [])).toBe("auto");
    expect(pickValidModel("custom", [])).toBe("custom");
  });

  it("keeps valid requested models", () => {
    expect(
      pickValidModel("gpt-5.3-codex", [
        { id: "auto", label: "auto" },
        { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
      ])
    ).toBe("gpt-5.3-codex");
  });

  it("prefers auto when the requested model is unavailable", () => {
    expect(
      pickValidModel("gpt-5.5-extra-high", [
        { id: "auto", label: "auto" },
        { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
      ])
    ).toBe("auto");
  });

  it("falls back to the first available model when auto is missing", () => {
    expect(pickValidModel("missing", [{ id: "gpt-5.3-codex", label: "gpt-5.3-codex" }])).toBe("gpt-5.3-codex");
    expect(pickValidModel("", [{ id: "gpt-5.3-codex", label: "gpt-5.3-codex" }])).toBe("gpt-5.3-codex");
  });
});
