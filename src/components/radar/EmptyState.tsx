import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib";

export function EmptyState({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center rd-banner text-dim [&_svg]:animate-[pulse_3s_ease-in-out_infinite] [&_svg]:text-rule",
        className
      )}
      {...props}
    />
  );
}
