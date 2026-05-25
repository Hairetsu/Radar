import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib";

export function FieldLabel({ className, ...props }: React.ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={cn(
        "block px-5 pb-1.5 pt-4 font-mono text-[9.5px] font-semibold uppercase tracking-[0.42em] text-signal",
        "after:ml-2 after:inline-block after:h-px after:w-3.5 after:bg-signal after:align-middle after:content-['']",
        className
      )}
      {...props}
    />
  );
}

const statusBadgeVariants = cva(
  "inline-flex h-[22px] items-center justify-center border px-1.5 font-mono text-[10px] font-semibold tracking-[0.04em]",
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
    defaultVariants: {
      tone: "ghost"
    }
  }
);

export interface StatusBadgeProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof statusBadgeVariants> {}

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone }), className)} {...props} />;
}

const statusDotVariants = cva("h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]", {
  variants: {
    tone: {
      good: "bg-jade/10 text-jade",
      warn: "bg-sand/10 text-sand",
      danger: "bg-rust/10 text-rust",
      move: "bg-steel/10 text-steel",
      ghost: "bg-muted/10 text-muted"
    }
  },
  defaultVariants: {
    tone: "ghost"
  }
});

export interface StatusDotProps extends React.ComponentPropsWithoutRef<"span">, VariantProps<typeof statusDotVariants> {}

export function StatusDot({ className, tone, ...props }: StatusDotProps) {
  return <span className={cn(statusDotVariants({ tone }), className)} {...props} />;
}

type StatusPillProps = React.ComponentPropsWithoutRef<"span"> & {
  live?: boolean;
  cool?: boolean;
};

export function StatusPill({ className, live, cool, children, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 items-center gap-2 border border-rule bg-surface/60 px-3 font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted",
        cool && "border-steel/35 text-steel",
        live && "border-signal/40 bg-signal/10 text-signal",
        className
      )}
      {...props}
    >
      {live !== undefined && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]",
            live && "animate-[pulse_1.4s_ease-in-out_infinite]"
          )}
        />
      )}
      {children}
    </span>
  );
}

export function EmptyState({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center font-mono text-[10px] uppercase tracking-[0.32em] text-dim [&_svg]:animate-[pulse_3s_ease-in-out_infinite] [&_svg]:text-rule",
        className
      )}
      {...props}
    />
  );
}

export function ToneText({
  tone,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { tone: "good" | "danger" }) {
  return <span className={cn(tone === "good" ? "text-jade" : "text-rust", className)} {...props} />;
}
