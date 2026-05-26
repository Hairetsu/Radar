import fs from "node:fs";
import path from "node:path";
import type { AiCustomSkill, AiWorkView } from "../../shared/ai-types.js";

const VALID_VIEWS = new Set<AiWorkView>(["traffic", "repeater", "scope", "ssl"]);

function skillsPath(userDataPath: string) {
  return path.join(userDataPath, "ai-skills.json");
}

function normalizeSkill(raw: Partial<AiCustomSkill>): AiCustomSkill | null {
  const id = String(raw.id || "").trim();
  const label = String(raw.label || "").trim();
  const hint = String(raw.hint || "").trim();
  const instructions = String(raw.instructions || "").trim();
  const views = Array.isArray(raw.views)
    ? raw.views.filter((view): view is AiWorkView => VALID_VIEWS.has(view as AiWorkView))
    : [];

  if (!id || !label || !instructions || views.length === 0) {
    return null;
  }

  return {
    id,
    label,
    hint: hint || "Custom operator skill",
    instructions,
    views,
    createdAt: String(raw.createdAt || new Date().toISOString())
  };
}

export function loadSkills(userDataPath: string): AiCustomSkill[] {
  const file = skillsPath(userDataPath);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AiCustomSkill>[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeSkill(item)).filter((item): item is AiCustomSkill => Boolean(item));
  } catch {
    return [];
  }
}

export function saveSkills(userDataPath: string, skills: AiCustomSkill[]): AiCustomSkill[] {
  const file = skillsPath(userDataPath);
  const next = skills
    .map((item) => normalizeSkill(item))
    .filter((item): item is AiCustomSkill => Boolean(item))
    .slice(0, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function upsertSkill(userDataPath: string, skill: AiCustomSkill): AiCustomSkill[] {
  const normalized = normalizeSkill(skill);
  if (!normalized) {
    throw new Error("Skill requires a label, instructions, and at least one view.");
  }
  const current = loadSkills(userDataPath);
  const index = current.findIndex((item) => item.id === normalized.id);
  const next =
    index === -1
      ? [...current, normalized]
      : current.map((item, itemIndex) => (itemIndex === index ? normalized : item));
  return saveSkills(userDataPath, next);
}

export function deleteSkill(userDataPath: string, id: string): AiCustomSkill[] {
  const next = loadSkills(userDataPath).filter((item) => item.id !== id);
  return saveSkills(userDataPath, next);
}

export function findSkill(userDataPath: string, id: string) {
  return loadSkills(userDataPath).find((item) => item.id === id);
}
