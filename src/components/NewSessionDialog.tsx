import { FormEvent, useEffect } from "react";
import { FilePlus2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type NewSessionDialogProps = {
  open: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => Promise<void>;
};

export function NewSessionDialog({ open, name, onNameChange, onClose, onCreate }: NewSessionDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate();
  };

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-16 backdrop-blur-md"
      onClick={onClose}
      data-testid="newSessionBackdrop"
      data-component="newSessionBackdrop"
    >
      <form
        className="theme-modal-surface grid w-full max-w-xl gap-5 border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        data-testid="newSessionDialog"
        data-component="newSessionDialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal">
              <FilePlus2 size={12} strokeWidth={1.8} /> Session
            </span>
            <h3 className="font-display text-[28px] uppercase tracking-[0.08em] text-bone">New Session</h3>
          </div>
          <Button type="button" variant="icon" size="icon" onClick={onClose} aria-label="Close new session dialog">
            <X size={15} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="grid gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Session name"
            data-testid="newSessionNameInput"
            data-component="newSessionNameInput"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="cancelNewSession">
              Cancel
            </Button>
            <Button type="submit" variant="solid" data-testid="confirmNewSession">
              <FilePlus2 size={13} strokeWidth={1.8} />
              Create
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
