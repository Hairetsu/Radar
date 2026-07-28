import type { ComponentPropsWithoutRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

const statusBadgeVariants = cva(
  "inline-flex h-[22px] items-center justify-center border px-1.5 font-mono text-label font-semibold tracking-data",
  {
    variants: {
      tone: {
        good: "border-jade/30 bg-jade/10 text-jade",
        warn: "border-sand/30 bg-sand/10 text-sand",
        danger: "border-rust/40 bg-rust/10 text-rust",
        move: "border-steel/30 bg-steel/10 text-steel",
        ghost: "border-rule bg-muted/5 text-muted"
      }
    },
    defaultVariants: { tone: "ghost" }
  }
);

export interface StatusBadgeProps
  extends ComponentPropsWithoutRef<"span">,
    VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)} {...props} />
  );
}
