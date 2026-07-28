import type { ComponentPropsWithoutRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

const statusDotVariants = cva(
  "h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]",
  {
    variants: {
      tone: {
        good: "bg-jade/10 text-jade",
        warn: "bg-sand/10 text-sand",
        danger: "bg-rust/10 text-rust",
        move: "bg-steel/10 text-steel",
        ghost: "bg-muted/10 text-muted"
      }
    },
    defaultVariants: { tone: "ghost" }
  }
);

export interface StatusDotProps
  extends ComponentPropsWithoutRef<"span">,
    VariantProps<typeof statusDotVariants> {}

export function StatusDot({ className, tone, ...props }: StatusDotProps) {
  return (
    <span className={cn(statusDotVariants({ tone }), className)} {...props} />
  );
}
