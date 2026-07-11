import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Override the default height (32px). */
  height?: string | number;
  /** Override the default width (100%). */
  width?: string | number;
  /** Make it circular (e.g. for avatar skeletons). */
  circle?: boolean;
  /** Rounded corners override (defaults to --radius-sm ≈ 9px). */
  rounded?: string;
}

/**
 * Loading skeleton placeholder with shimmer animation.
 *
 * Renders a pulsing block matching the dashboard colour scheme.
 * Use to indicate content is still loading.
 */
export function Skeleton({
  height = 32,
  width = "100%",
  circle = false,
  rounded,
  className = "",
  style,
  ...rest
}: SkeletonProps) {
  const borderRadius = circle ? "50%" : (rounded ?? "var(--radius-sm)");

  return (
    <div
      role="status"
      aria-label="載入中"
      className={`skeleton-dashboard ${className}`}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        borderRadius,
        ...style,
      }}
      {...rest}
    />
  );
}
