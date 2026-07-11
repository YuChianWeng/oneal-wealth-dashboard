/**
 * Generic SWR fetcher for the Oneal Wealth Dashboard API layer.
 *
 * All API endpoints return `{ version: 1, data: T }` on success
 * and `{ version: 1, error: { message, code } }` on failure.
 * This fetcher unwraps `data` and throws on API-level errors.
 */

export interface ApiError {
  message: string;
  code: string;
}

export class FetchError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "FetchError";
    this.code = code;
    this.status = status;
  }
}

/**
 * SWR-compatible fetcher.
 *
 * Calls `fetch(url)`, parses the versioned JSON envelope, and either
 * returns `data` or throws a `FetchError` with the API error details.
 */
export async function swrFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);

  // Network / HTTP errors (not JSON)
  if (!res.ok) {
    let apiMessage = res.statusText;
    let apiCode = "HTTP_ERROR";
    try {
      const body = await res.json();
      if (body?.error?.message) apiMessage = body.error.message;
      if (body?.error?.code) apiCode = body.error.code;
    } catch {
      // Response wasn't JSON — use status text
    }
    throw new FetchError(apiMessage, apiCode, res.status);
  }

  const body = await res.json();

  // API-level error (HTTP 200 with error envelope)
  if (body?.error) {
    throw new FetchError(
      body.error.message ?? "Unknown API error",
      body.error.code ?? "API_ERROR",
      res.status,
    );
  }

  return body.data as T;
}
