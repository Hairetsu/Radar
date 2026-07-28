import { Eraser, FilePlus2 } from "lucide-react";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import { Button } from "../ui/button";

export type TrafficViewActionsProps = Pick<TrafficDomain, "clearCaptures"> & {
  openNewSessionDialog: () => void;
};

export function TrafficViewActions({
  openNewSessionDialog,
  clearCaptures
}: TrafficViewActionsProps) {
  return (
    <>
      <Button
        variant="outline"
        onClick={openNewSessionDialog}
        title="Open a fresh local session"
        data-testid="createLocalSession"
        data-component="createLocalSession"
      >
        <FilePlus2 size={14} strokeWidth={1.7} />
        New Session
      </Button>
      <Button
        variant="icon"
        size="icon"
        onClick={clearCaptures}
        title="Clear log"
        data-testid="clearCaptures"
        data-component="clearCaptures"
      >
        <Eraser size={15} strokeWidth={1.7} />
      </Button>
    </>
  );
}
