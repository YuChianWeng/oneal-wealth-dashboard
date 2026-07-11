import type { HTMLAttributes } from "react";

export type ChipVariant = "default" | "accent" | "pos" | "neg" | "warn";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual variant mapping to design-token colours. */
  variant?: ChipVariant;
}

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  default: "bg-dashboard-chip text-dashboard-muted",
  accent: "bg-dashboard-surface-2 text-dashboard-accent",
  pos: "bg-dashboard-surface-2 text-dashboard-pos",
  neg: "bg-dashboard-surface-2 text-dashboard-neg",
  warn: "bg-dashboard-surface-2 text-dashboard-warn",
};

/**
 * Small chip / label component.
 *
 * Renders an inline-flex pill with dashboard styling.
 * Use for tags, badges, and micro-labels.
 */
export function Chip({
  variant = "default",
  className = "",
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-ds-pill px-2 py-[3px] font-mono text-[11px] leading-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
