import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib";

interface ToneTextProps extends ComponentPropsWithoutRef<"span"> {
  tone: "good" | "danger";
}

export function ToneText({ tone, className, ...props }: ToneTextProps) {
  return (
    <span
      className={cn(tone === "good" ? "text-jade" : "text-rust", className)}
      {...props}
    />
  );
}
