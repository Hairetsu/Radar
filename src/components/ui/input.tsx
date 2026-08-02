import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const inputVariants = cva(
  [
    "flex min-w-0 w-full border border-rule radar-field font-mono text-body tracking-data outline-none transition",
    // Fields opt out of the global focus outline: the border shift plus glow is
    // the conventional field affordance and never clips inside dense panes.
    "placeholder:text-dim focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-[var(--theme-focus-glow)]",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        default: "h-10 px-3",
        address:
          "h-full border-0 bg-transparent px-2 text-body tracking-data focus-visible:border-0 focus-visible:ring-0",
        compact: "h-9 px-2.5"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface InputProps extends React.ComponentPropsWithoutRef<"input">, VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<React.ElementRef<"input">, InputProps>(({
  className,
  variant,
  id,
  placeholder,
  "aria-label": ariaLabel,
  ...props
}, ref) => (
  <input
    ref={ref}
    className={cn(inputVariants({ variant }), className)}
    id={id}
    placeholder={placeholder}
    aria-label={ariaLabel || (!id && typeof placeholder === "string" ? placeholder : undefined)}
    {...props}
  />
));
Input.displayName = "Input";
