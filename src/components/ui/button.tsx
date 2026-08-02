import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 border font-mono text-body font-semibold uppercase tracking-label",
    "transition duration-200 ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--theme-focus)] focus-visible:ring-[4px] focus-visible:ring-[var(--theme-focus-glow)]",
    "disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0",
    "[&_svg]:shrink-0"
  ],
  {
    variants: {
      variant: {
        solid:
          "border-signal bg-signal text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_22px_-8px_color-mix(in_srgb,var(--color-signal)_50%,transparent)] hover:-translate-y-px hover:bg-signal-soft hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_28px_-8px_color-mix(in_srgb,var(--color-signal)_60%,transparent)]",
        outline:
          "border-[color-mix(in_srgb,var(--color-bone)_18%,transparent)] bg-transparent text-bone hover:border-signal hover:bg-signal/5 hover:text-signal",
        icon: "border-rule bg-graphite text-copy hover:border-signal hover:bg-signal/5 hover:text-signal",
        zap:
          "z-0 overflow-hidden border-signal bg-transparent font-bold tracking-eyebrow text-signal before:absolute before:inset-0 before:-z-10 before:translate-y-full before:bg-signal before:transition-transform before:duration-300 before:content-[''] hover:text-ink hover:before:translate-y-0",
        ghost: "border-transparent bg-transparent text-muted hover:border-rule hover:bg-surface/50 hover:text-bone"
      },
      size: {
        default: "h-9 px-5",
        compact: "h-[30px] px-3 text-body",
        sm: "h-8 px-3.5",
        icon: "h-9 w-9 px-0"
      }
    },
    defaultVariants: {
      variant: "outline",
      size: "default"
    }
  }
);

export interface ButtonProps extends React.ComponentPropsWithoutRef<"button">, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<React.ElementRef<"button">, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
