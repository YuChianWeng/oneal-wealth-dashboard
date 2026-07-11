"use client";

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional header content rendered above the card body. */
  header?: ReactNode;
}

/**
 * Base card component.
 *
 * Renders a surface card with the dashboard design tokens:
 * surface background, border, radius, and shadow.
 * Accepts `className` for Tailwind extension.
 */
export function Card({ header, children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-ds-lg border border-dashboard-border bg-dashboard-surface shadow-ds-card ${className}`}
      {...rest}
    >
      {header ? (
        <div className="border-b border-dashboard-border px-[22px] py-4">
          {header}
        </div>
      ) : null}
      <div className="p-[18px]">{children}</div>
    </div>
  );
}
