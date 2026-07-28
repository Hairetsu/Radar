import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib";

interface StatusPillProps extends ComponentPropsWithoutRef<"span"> {
  live?: boolean;
  cool?: boolean;
}

export function StatusPill({
  className,
  live,
  cool,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 items-center gap-2 border border-rule radar-status-pill px-3 rd-eyebrow text-muted",
        cool && "border-steel/35 text-steel",
        live && "border-signal/40 bg-signal/10 text-signal",
        className
      )}
      {...props}
    >
      {live !== undefined && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]",
            live && "animate-[pulse_1.4s_ease-in-out_infinite]"
          )}
        />
      )}
      {children}
    </span>
  );
}
