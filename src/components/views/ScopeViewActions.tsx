import type { ScopeDomain } from "../../hooks/workbench/useScopeDomain";
import { Button } from "../ui/button";

export type ScopeViewActionsProps = Pick<ScopeDomain, "saveTargets">;

export function ScopeViewActions({ saveTargets }: ScopeViewActionsProps) {
  return (
    <Button
      variant="solid"
      size="compact"
      onClick={() => saveTargets()}
      data-testid="commitTargets"
      data-component="commitTargets"
    >
      Commit
    </Button>
  );
}
