import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib";

export function FieldLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={cn(
        "block px-5 pb-1.5 pt-4 font-mono text-label font-semibold uppercase tracking-banner text-signal",
        "after:ml-2 after:inline-block after:h-px after:w-3.5 after:bg-signal after:align-middle after:content-['']",
        className
      )}
      {...props}
    />
  );
}
