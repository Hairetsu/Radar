import { describe, expect, it } from "vitest";
import { parseAvailableModels, parseModelLines } from "./modelParse.js";

describe("parseModelLines", () => {
  it("parses plain line output", () => {
    expect(parseModelLines("gpt-4o\nclaude-sonnet\n")).toEqual([
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "claude-sonnet", label: "claude-sonnet" }
    ]);
  });

  it("parses json arrays", () => {
    expect(parseModelLines('[{"id":"auto","name":"Auto"},{"id":"gpt-4o"}]')).toEqual([
      { id: "auto", label: "Auto" },
      { id: "gpt-4o", label: "gpt-4o" }
    ]);
  });

  it("ignores empty and commented lines", () => {
    expect(parseModelLines("\n# hidden\n\n")).toEqual([]);
  });

  it("parses available-models error output", () => {
    expect(parseAvailableModels("Cannot use this model. Available models: auto, gpt-5.3-codex")).toEqual([
      { id: "auto", label: "auto" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
    ]);
  });

  it("parses available-models error output via parseModelLines", () => {
    expect(
      parseModelLines("Cannot use this model. Available models: auto, composer-2-fast, gpt-5.3-codex")
    ).toEqual([
      { id: "auto", label: "auto" },
      { id: "composer-2-fast", label: "composer-2-fast" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
    ]);
  });

  it("reads model ids from json objects", () => {
    expect(parseModelLines('[{"model":"codex-mini","label":"Mini"}]')).toEqual([
      { id: "codex-mini", label: "Mini" }
    ]);
  });

  it("ignores invalid json entries", () => {
    expect(parseModelLines("[null,123,false]")).toEqual([]);
  });

  it("parses plain comma-separated model lists", () => {
    expect(parseModelLines("auto, composer-2-fast, gpt-5.3-codex")).toEqual([
      { id: "auto", label: "auto" },
      { id: "composer-2-fast", label: "composer-2-fast" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
    ]);
  });

  it("strips ansi codes from line output", () => {
    expect(parseModelLines("\u001b[36mauto\u001b[39m\n\u001b[36mgpt-5.3-codex\u001b[39m\n")).toEqual([
      { id: "auto", label: "auto" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
    ]);
  });

  it("ignores blank lines with only ansi codes", () => {
    expect(parseModelLines("[36m[39m\nauto\n")).toEqual([{ id: "auto", label: "auto" }]);
  });

  it("dedupes repeated model ids", () => {
    expect(parseModelLines("auto\nauto\n")).toEqual([{ id: "auto", label: "auto" }]);
  });
});
