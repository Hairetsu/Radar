import { useEffect, useRef } from "react";

export function useRestoreFocus(open: boolean) {
  const returnTarget = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Capture the opener during render. Conditionally mounted overlays can move
  // focus through `autoFocus` before effects run, which would otherwise make
  // the overlay's first field its own return target.
  if (open && !wasOpen.current) {
    returnTarget.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) {
      return;
    }

    return () => {
      const target = returnTarget.current;
      if (target?.isConnected) {
        target.focus();
      }
    };
  }, [open]);
}
