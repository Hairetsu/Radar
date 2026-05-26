import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const inputVariants = cva(
  [
    "flex min-w-0 border border-rule radar-field font-mono text-[12px] tracking-[0.02em] outline-none transition",
    "placeholder:text-dim focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-signal/10",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        default: "h-10 px-3",
        address:
          "h-full border-0 bg-transparent px-2 text-[12.5px] tracking-[0.01em] focus-visible:border-0 focus-visible:ring-0",
        compact: "h-9 px-2.5"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface InputProps extends React.ComponentPropsWithoutRef<"input">, VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<React.ElementRef<"input">, InputProps>(({ className, variant, ...props }, ref) => (
  <input ref={ref} className={cn(inputVariants({ variant }), className)} {...props} />
));
Input.displayName = "Input";
