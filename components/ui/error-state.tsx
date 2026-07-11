import type { HTMLAttributes } from "react";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Non-sensitive, user-facing message describing the error.
   * Never include stack traces or internal details here.
   */
  message?: string;
  /** Optional retry callback — renders a button when provided. */
  onRetry?: () => void;
  /** Label for the retry button. */
  retryLabel?: string;
}

/**
 * Non-sensitive error display.
 *
 * Shows a generic error state without exposing internal details.
 * Supports an optional retry action.
 */
export function ErrorState({
  message = "載入時發生錯誤，請稍後再試。",
  onRetry,
  retryLabel = "重新載入",
  className = "",
  children,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-ds-lg border border-dashboard-border bg-dashboard-surface px-6 py-12 text-center ${className}`}
      {...rest}
    >
      {/* Warning icon */}
      <svg
        aria-hidden="true"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-dashboard-warn"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <p className="max-w-[320px] text-[13px] text-dashboard-muted">
        {message}
      </p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-ds-sm border border-dashboard-border-2 bg-transparent px-4 py-[6px] text-[12px] text-dashboard-muted transition-colors hover:bg-dashboard-chip hover:text-dashboard-text"
        >
          {retryLabel}
        </button>
      ) : null}

      {children}
    </div>
  );
}
