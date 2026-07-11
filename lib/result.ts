/**
 * Result<T, E> — a discriminated success / error union.
 *
 * Inspired by Rust's Result. Never throws; the caller must handle both cases.
 */

// ---------------------------------------------------------------------------
// Tagged types
// ---------------------------------------------------------------------------

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Methods (standalone functions that work like methods)
// ---------------------------------------------------------------------------

/**
 * Unwrap the Ok value or return the fallback for Err.
 * This is the safe alternative to Rust's `unwrap()` — it never throws.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Unwrap the Ok value. Throws if result is Err. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/** Map the Ok value through `fn`, leaving Err unchanged. */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

/** Map the Err value through `fn`, leaving Ok unchanged. */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (result.ok) return result;
  return err(fn(result.error));
}

/**
 * Chain a fallible operation. If Ok, call `fn` which returns a new Result.
 * If Err, short-circuit.
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}
