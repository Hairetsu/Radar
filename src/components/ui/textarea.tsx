import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const textareaVariants = cva(
  [
    "min-h-0 resize-none border border-rule radar-field p-3 font-mono text-body leading-[1.65] outline-none transition",
    "[font-feature-settings:'calt'_0] placeholder:text-dim",
    "focus-visible:border-signal focus-visible:ring-[3px] focus-visible:ring-[var(--theme-focus-glow)]",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        default: "w-full",
        code: "mx-5 w-[calc(100%-40px)]",
        bare: "w-full"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface TextareaProps extends React.ComponentPropsWithoutRef<"textarea">, VariantProps<typeof textareaVariants> {}

export const Textarea = React.forwardRef<React.ElementRef<"textarea">, TextareaProps>(
  ({ className, variant, ...props }, ref) => (
    <textarea ref={ref} className={cn(textareaVariants({ variant }), className)} {...props} />
  )
);
Textarea.displayName = "Textarea";
