import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type { WorkView } from "../hooks/useRadarWorkbench";
import { useAsyncAction } from "../hooks/useAsyncAction";
import {
  defaultSelection,
  skillsForView,
  VIEW_AI_TASKS,
  type AiCustomSkill,
  type AiPaletteSelection
} from "./types";

export const emptySkillDraft = {
  label: "",
  hint: "",
  instructions: ""
};

export function useCommandPaletteSkills({
  open,
  view,
  onNotice,
  onError
}: {
  open: boolean;
  view: WorkView;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selection, setSelection] = useState<AiPaletteSelection>(() =>
    defaultSelection(view, [])
  );
  const [skills, setSkills] = useState<AiCustomSkill[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillDraft, setSkillDraft] = useState(emptySkillDraft);
  const viewTasks = VIEW_AI_TASKS[view];
  const viewSkills = useMemo(
    () => skillsForView(skills, view),
    [skills, view]
  );

  const refresh = useCallback(async () => {
    const next = (await window.radar?.getAiSkills()) || [];
    setSkills(next);
    return next;
  }, []);
  const save = useCallback(async () => {
    if (!window.radar) {
      onError("Run in Electron to save skills.");
      return;
    }
    const label = skillDraft.label.trim();
    const instructions = skillDraft.instructions.trim();
    if (!label || !instructions) {
      onError("Skill needs a label and instructions.");
      return;
    }
    try {
      onError("");
      const nextSkill: AiCustomSkill = {
        id: `skill-${Date.now()}`,
        label,
        hint:
          skillDraft.hint.trim() || "Custom operator skill",
        instructions,
        views: [view],
        createdAt: new Date().toISOString()
      };
      setSkills(await window.radar.saveAiSkill(nextSkill));
      setSelection({ kind: "custom", skillId: nextSkill.id });
      setSkillDraft(emptySkillDraft);
      setShowSkillForm(false);
      onNotice(`Saved skill: ${label}`);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not save skill"
      );
    }
  }, [onError, onNotice, skillDraft, view]);
  const remove = useCallback(
    async (skillId: string) => {
      if (!window.radar) {
        return;
      }
      const next = await window.radar.deleteAiSkill(skillId);
      setSkills(next);
      if (
        selection.kind === "custom" &&
        selection.skillId === skillId
      ) {
        setSelection(defaultSelection(view, next));
      }
      onNotice("Skill removed");
    },
    [onNotice, selection, view]
  );
  const saveMutation = useAsyncAction(save);
  const resetDraft = useCallback(() => {
    setShowSkillForm(false);
    setSkillDraft(emptySkillDraft);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refresh().then((next) =>
      setSelection(defaultSelection(view, next))
    );
  }, [open, refresh, view]);
  useEffect(() => {
    if (!open) {
      return;
    }
    setSelection((current) => {
      if (
        current.kind === "custom" &&
        viewSkills.some((skill) => skill.id === current.skillId)
      ) {
        return current;
      }
      if (
        current.kind === "builtin" &&
        viewTasks.includes(current.task)
      ) {
        return current;
      }
      return defaultSelection(view, skills);
    });
  }, [open, skills, view, viewSkills, viewTasks]);

  return {
    selection,
    setSelection,
    viewTasks,
    viewSkills,
    showSkillForm,
    setShowSkillForm,
    skillDraft,
    setSkillDraft,
    saveMutation,
    remove,
    resetDraft
  };
}
