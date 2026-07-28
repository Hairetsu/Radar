import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib";

export function SubFieldLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={cn("block rd-label-sm text-muted", className)}
      {...props}
    />
  );
}
