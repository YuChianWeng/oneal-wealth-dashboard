"use client";

import type { HTMLAttributes } from "react";

export type StatusVariant =
  | "positive"
  | "negative"
  | "warning"
  | "info"
  | "neutral";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. */
  variant?: StatusVariant;
  /** Accessible text label — always shown (non-colour-only indicator). */
  label: string;
}

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  positive: "bg-dashboard-chip text-dashboard-pos",
  negative: "bg-dashboard-chip text-dashboard-neg",
  warning: "bg-dashboard-chip text-dashboard-warn",
  info: "bg-dashboard-chip text-dashboard-accent-2",
  neutral: "bg-dashboard-chip text-dashboard-muted",
};

const DOT_CLASSES: Record<StatusVariant, string> = {
  positive: "bg-dashboard-pos",
  negative: "bg-dashboard-neg",
  warning: "bg-dashboard-warn",
  info: "bg-dashboard-accent-2",
  neutral: "bg-dashboard-faint",
};

/**
 * Status indicator with colour-independent text label.
 *
 * Always renders the text label so colour is never the sole indicator.
 * Includes a small coloured dot for visual grouping.
 */
export function StatusBadge({
  variant = "neutral",
  label,
  className = "",
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-[7px] rounded-ds-pill px-[8px] py-[2px] font-mono text-[11px] ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-[7px] w-[7px] rounded-full ${DOT_CLASSES[variant]}`}
      />
      {label}
    </span>
  );
}
