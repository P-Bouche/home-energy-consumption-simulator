/**
 * Minimal error channel for pure domain operations (P4 commands). The domain
 * has no exceptions on the happy path: fallible operations return
 * `Either<L, R>` so callers handle the failure explicitly — no silent catches.
 */
export type Either<L, R> =
  | { readonly ok: true; readonly value: R }
  | { readonly ok: false; readonly error: L };

/**
 * @param value - the success value
 */
export function right<L, R>(value: R): Either<L, R> {
  return { ok: true, value };
}

/**
 * @param error - the failure value
 */
export function left<L, R>(error: L): Either<L, R> {
  return { ok: false, error };
}

/**
 * @param either - an Either
 * @returns true when the Either is a Right
 */
export function isRight<L, R>(either: Either<L, R>): either is { ok: true; value: R } {
  return either.ok;
}

/**
 * @param either - an Either
 * @returns true when the Either is a Left
 */
export function isLeft<L, R>(either: Either<L, R>): either is { ok: false; error: L } {
  return !either.ok;
}
