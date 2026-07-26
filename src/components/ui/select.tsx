import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const selectVariants = cva(
  [
    "flex min-w-0 appearance-none border border-rule radar-field px-3 font-mono text-body outline-none transition",
    "focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-[var(--theme-focus-glow)]",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        default: "h-10 tracking-data",
        method: "h-10 radar-input-gradient font-semibold uppercase tracking-key text-signal",
        compact: "h-9 text-meta uppercase tracking-key"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface SelectProps extends React.ComponentPropsWithoutRef<"select">, VariantProps<typeof selectVariants> {}

export const Select = React.forwardRef<React.ElementRef<"select">, SelectProps>(
  ({ className, variant, ...props }, ref) => (
  <select ref={ref} className={cn(selectVariants({ variant }), className)} {...props} />
  )
);
Select.displayName = "Select";
