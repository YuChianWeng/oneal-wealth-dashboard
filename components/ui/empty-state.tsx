import type { HTMLAttributes } from "react";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Heading shown above the description. */
  title?: string;
  /** Human-readable explanation of why this area is empty. */
  description?: string;
  /** Optional action element (e.g. a link or button). */
  action?: React.ReactNode;
}

/**
 * Empty / missing-data placeholder.
 *
 * Use when a section has no data to display, so the user
 * understands the absence is intentional rather than a crash.
 */
export function EmptyState({
  title = "尚無資料",
  description = "此區塊目前沒有可顯示的內容。",
  action,
  className = "",
  children,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 rounded-ds-lg border border-dashed border-dashboard-border bg-dashboard-surface px-6 py-12 text-center ${className}`}
      {...rest}
    >
      {/* Icon */}
      <svg
        aria-hidden="true"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-dashboard-faint"
      >
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>

      {title ? (
        <p className="text-[14px] font-medium text-dashboard-muted">{title}</p>
      ) : null}

      {description ? (
        <p className="max-w-[280px] text-[12px] text-dashboard-faint">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-1">{action}</div> : null}

      {children}
    </div>
  );
}
