import { Play } from "lucide-react";
import type { AutomateDomain } from "../../hooks/workbench/useAutomateDomain";
import { Button } from "../ui/button";

export type AutomateViewActionsProps = Pick<
  AutomateDomain,
  "startAutomateSession" | "automatePositions" | "automatePayloads"
>;

export function AutomateViewActions({
  startAutomateSession,
  automatePositions,
  automatePayloads
}: AutomateViewActionsProps) {
  return (
    <Button
      variant="solid"
      onClick={() => void startAutomateSession()}
      disabled={automatePositions.length === 0 || automatePayloads.length === 0}
      data-testid="startAutomateSessionHeader"
      data-component="startAutomateSessionHeader"
    >
      <Play size={14} strokeWidth={1.7} />
      Start Run
    </Button>
  );
}
