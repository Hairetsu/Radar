import { Target } from "lucide-react";
import type { RepeaterDomain } from "../../hooks/workbench/useRepeaterDomain";
import type { ScopeDomain } from "../../hooks/workbench/useScopeDomain";
import { Button } from "../ui/button";

export type RepeaterViewActionsProps = Pick<ScopeDomain, "addTarget"> &
  Pick<RepeaterDomain, "draft">;

export function RepeaterViewActions({
  addTarget,
  draft
}: RepeaterViewActionsProps) {
  return (
    <Button
      variant="outline"
      onClick={() => addTarget(draft.url)}
      data-testid="trustOrigin"
      data-component="trustOrigin"
    >
      <Target size={14} strokeWidth={1.7} />
      Trust Origin
    </Button>
  );
}
