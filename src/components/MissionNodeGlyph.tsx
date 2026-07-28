import { CircleHelp, FlaskConical, GitBranch, ShieldCheck, Target } from "lucide-react";
import type { MissionNode } from "./agentMissionGraphModel";

export function MissionNodeGlyph({ node }: { node: MissionNode }) {
  if (node.entity === "objective") return <Target size={12} strokeWidth={1.8} />;
  if (node.entity === "hypothesis") return <GitBranch size={12} strokeWidth={1.8} />;
  if (node.entity === "experiment") return <FlaskConical size={12} strokeWidth={1.8} />;
  if (node.entity === "claim") return <ShieldCheck size={12} strokeWidth={1.8} />;
  return <CircleHelp size={12} strokeWidth={1.8} />;
}
