import type { Dispatch, SetStateAction } from "react";
import { Eraser, Fingerprint } from "lucide-react";
import { Button } from "../ui/button";

export type AdvancedViewActionsProps = {
  advancedImportText: string;
  setAdvancedImportText: Dispatch<SetStateAction<string>>;
  identityLabOpen: boolean;
  setIdentityLabOpen: Dispatch<SetStateAction<boolean>>;
};

export function AdvancedViewActions({
  identityLabOpen,
  setIdentityLabOpen,
  setAdvancedImportText,
  advancedImportText
}: AdvancedViewActionsProps) {
  return (
    <>
      <Button
        variant={identityLabOpen ? "solid" : "outline"}
        type="button"
        onClick={() => setIdentityLabOpen((open) => !open)}
        data-testid="toggleIdentityLab"
      >
        <Fingerprint size={14} strokeWidth={1.7} />
        {identityLabOpen ? "Advanced Signals" : "Identity Lab"}
      </Button>
      {!identityLabOpen && (
        <Button
          variant="outline"
          type="button"
          onClick={() => setAdvancedImportText("")}
          disabled={!advancedImportText.trim()}
          data-testid="clearAdvancedImport"
        >
          <Eraser size={14} strokeWidth={1.7} />
          Clear Import
        </Button>
      )}
    </>
  );
}
