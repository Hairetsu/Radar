import { ExternalLink, FileText } from "lucide-react";
import type { FindingsDomain } from "../../hooks/workbench/useFindingsDomain";
import type { TrafficDomain } from "../../hooks/workbench/useTrafficDomain";
import type { FindingTemplateId } from "../../types";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export type FindingsViewActionsProps = Pick<
  FindingsDomain & TrafficDomain,
  "findingTemplates" | "selected" | "createFindingFromCapture"
> & {
  findingTemplateId: FindingTemplateId;
  setFindingTemplateId: (value: FindingTemplateId) => void;
  onBuildReport: () => void;
};

export function FindingsViewActions({
  findingTemplates,
  selected,
  createFindingFromCapture,
  findingTemplateId,
  setFindingTemplateId,
  onBuildReport
}: FindingsViewActionsProps) {
  return (
    <>
      <Select
        variant="compact"
        value={findingTemplateId}
        onChange={(event) => setFindingTemplateId(event.target.value as FindingTemplateId)}
        aria-label="Finding template"
        data-testid="findingTemplateSelectHeader"
      >
        {findingTemplates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.title}
          </option>
        ))}
      </Select>
      <Button
        variant="outline"
        type="button"
        onClick={() => void createFindingFromCapture(selected, findingTemplateId)}
        disabled={!selected}
        data-testid="createFindingFromCaptureHeader"
      >
        <FileText size={14} strokeWidth={1.7} />
        From Capture
      </Button>
      <Button
        variant="solid"
        type="button"
        onClick={onBuildReport}
        data-testid="buildFindingReportHeader"
      >
        <ExternalLink size={14} strokeWidth={1.7} />
        Build Report
      </Button>
    </>
  );
}
