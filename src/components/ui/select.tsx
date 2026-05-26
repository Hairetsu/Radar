import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const selectVariants = cva(
  [
    "flex min-w-0 appearance-none border border-rule radar-field px-3 font-mono text-[12px] outline-none transition",
    "focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-signal/10",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        default: "h-10 tracking-[0.02em]",
        method: "h-10 radar-input-gradient font-semibold uppercase tracking-[0.12em] text-signal",
        compact: "h-9 text-[11px] uppercase tracking-[0.12em]"
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
