/**
 * Custom error hierarchy for the Oneal Wealth Dashboard.
 *
 * Every error carries a **safe** `message` and `code` suitable for client
 * responses. Internal details (paths, secrets, raw DB errors) go into
 * `cause` which is **never** serialised to the client.
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly code: string;
  public readonly cause: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Sub-classes
// ---------------------------------------------------------------------------

export class ConfigError extends AppError {
  constructor(message: string, code = "CONFIG_ERROR", cause?: unknown) {
    super(message, code, cause);
    this.name = "ConfigError";
  }
}

export class SourceError extends AppError {
  constructor(message: string, code = "SOURCE_ERROR", cause?: unknown) {
    super(message, code, cause);
    this.name = "SourceError";
  }
}

export class DataQualityError extends AppError {
  constructor(message: string, code = "DATA_QUALITY", cause?: unknown) {
    super(message, code, cause);
    this.name = "DataQualityError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = "NOT_FOUND", cause?: unknown) {
    super(message, code, cause);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Safe response
// ---------------------------------------------------------------------------

/** Fields that are safe to return to the client. */
export interface SafeErrorResponse {
  message: string;
  code: string;
}

/**
 * Convert any error into a safe client response.
 *
 * AppErrors use their own message + code.  Unknown errors get a generic
 * "Internal Server Error" — the original message is only logged server-side.
 */
export function toSafeResponse(err: unknown): SafeErrorResponse {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code };
  }

  // Never leak raw error messages
  return { message: "Internal Server Error", code: "INTERNAL_ERROR" };
}
