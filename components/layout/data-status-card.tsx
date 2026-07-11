export interface DataStatusCardProps {
  /** Last sync timestamp for finance data (human-readable string). */
  financeLastSync?: string;
  /** Last sync timestamp for stock prices (human-readable string). */
  priceLastSync?: string;
  /** Count of warnings (e.g. transactions missing reason). */
  warningCount?: number;
  /** Warning message text. */
  warningLabel?: string;
}

/**
 * Data-status footer card shown at the bottom of the desktop sidebar.
 *
 * Displays last-sync timestamps for finance and prices,
 * plus a warning count with amber dot.
 * All values are driven by props — no hardcoded demo numbers.
 */
export function DataStatusCard({
  financeLastSync,
  priceLastSync,
  warningCount = 0,
  warningLabel = "筆交易缺少交易理由",
}: DataStatusCardProps) {
  const hasFinance = typeof financeLastSync === "string";
  const hasPrice = typeof priceLastSync === "string";

  return (
    <div className="rounded-[11px] border border-dashboard-border bg-dashboard-surface p-[12px_13px]">
      {/* Header */}
      <div className="mb-[9px] flex items-center gap-[8px]">
        <span
          aria-hidden="true"
          className="inline-block h-[7px] w-[7px] rounded-full bg-dashboard-pos"
          style={{
            boxShadow:
              "0 0 0 3px color-mix(in srgb, var(--color-pos) 22%, transparent)",
          }}
        />
        <span className="text-[11px] tracking-[0.3px] text-dashboard-muted">
          資料狀態
        </span>
      </div>

      {/* Sync timestamps */}
      <div className="flex flex-col gap-[5px] font-mono text-[11px] text-dashboard-faint">
        <div className="flex justify-between">
          <span>財務帳本</span>
          <span className="text-dashboard-muted">
            {hasFinance ? financeLastSync : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>股價</span>
          <span className="text-dashboard-muted">
            {hasPrice ? priceLastSync : "—"}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {warningCount > 0 && (
        <div className="mt-[9px] flex items-center gap-[7px] text-[11px] text-dashboard-warn">
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] flex-shrink-0 rounded-full bg-dashboard-warn"
          />
          <span>
            {warningCount} {warningLabel}
          </span>
        </div>
      )}
    </div>
  );
}
