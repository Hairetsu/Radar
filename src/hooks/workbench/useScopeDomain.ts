import { useCallback, useState } from "react";
import { originFromUrl } from "../../lib";
import type { NoticePort } from "./ports";

export type ScopeDomain = ReturnType<typeof useScopeDomain>;

export function useScopeDomain(ports: NoticePort) {
  const [targets, setTargets] = useState<string[]>([]);
  const [targetText, setTargetText] = useState("");

  const saveTargets = useCallback(
    async (nextText = targetText) => {
      const next = nextText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const saved = (await window.radar?.setTargets(next)) || next;
      setTargets(saved);
      setTargetText(saved.join("\n"));
      ports.setNotice("Targets saved");
    },
    [ports, targetText]
  );

  const addTarget = useCallback(
    async (value: string) => {
      const origin = originFromUrl(value);
      if (!origin) {
        return;
      }
      if (targets.includes(origin)) {
        ports.setNotice(`${origin} already in scope`);
        return;
      }
      const next = [...targets, origin];
      const saved = (await window.radar?.setTargets(next)) || next;
      setTargets(saved);
      setTargetText(saved.join("\n"));
      ports.setNotice(`Added ${origin}`);
    },
    [ports, targets]
  );

  return {
    targets,
    setTargets,
    targetText,
    setTargetText,
    saveTargets,
    addTarget
  };
}
