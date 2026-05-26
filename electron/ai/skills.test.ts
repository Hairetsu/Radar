import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteSkill, loadSkills, upsertSkill } from "./skills.js";

describe("ai skills", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("saves and loads custom skills", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-skills-"));
    upsertSkill(tmpDir, {
      id: "skill-1",
      label: "Header diff",
      hint: "Compare auth headers",
      instructions: "Compare request headers for auth drift.",
      views: ["traffic"],
      createdAt: new Date().toISOString()
    });

    expect(loadSkills(tmpDir)).toHaveLength(1);
  });

  it("deletes a skill", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-skills-"));
    upsertSkill(tmpDir, {
      id: "skill-1",
      label: "Header diff",
      hint: "Compare auth headers",
      instructions: "Compare request headers for auth drift.",
      views: ["traffic"],
      createdAt: new Date().toISOString()
    });

    expect(deleteSkill(tmpDir, "skill-1")).toEqual([]);
  });

  it("updates an existing skill", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-skills-"));
    const base = {
      id: "skill-1",
      label: "Header diff",
      hint: "Compare auth headers",
      instructions: "Compare request headers for auth drift.",
      views: ["traffic"] as const,
      createdAt: new Date().toISOString()
    };
    upsertSkill(tmpDir, base);
    upsertSkill(tmpDir, { ...base, label: "Header compare" });
    expect(loadSkills(tmpDir)[0]?.label).toBe("Header compare");
  });

  it("returns empty list for invalid stored payload", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-skills-"));
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "ai-skills.json"), JSON.stringify({ not: "array" }), "utf8");
    expect(loadSkills(tmpDir)).toEqual([]);
  });

  it("rejects invalid skill payloads", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-skills-"));
    expect(() =>
      upsertSkill(tmpDir, {
        id: "skill-1",
        label: "",
        hint: "",
        instructions: "",
        views: [],
        createdAt: new Date().toISOString()
      })
    ).toThrow("Skill requires");
  });
});
