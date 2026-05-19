/**
 * Structural shims for Orchestra API response types.
 *
 * `@gertsai/api-envelope` is a Tier-1 browser-safe shared kernel and MUST NOT
 * depend on `@gertsai/api-core` at compile or runtime. Yet `response-wrapper.ts`
 * and `type-guards.ts` originally pulled `OrchestraApiResponse` /
 * `ResponseCode` type-only imports from `api-core/lib/apiResponse/*`.
 *
 * Those imports were used purely at type position (no runtime values) — we
 * therefore replace them with **structural** interfaces here. Real
 * `OrchestraApiResponse` instances are duck-typed against this shape, so
 * existing api-core call sites (and their tests) continue to compile and
 * pass `OrchestraApiResponse<ResponseCode>` instances without any changes.
 *
 * Wave 15.A (PRD-050 / EVID-067 §15.A).
 *
 * @packageDocumentation
 */

/**
 * Structural counterpart of `@gertsai/api-core`'s `ResponseCode` enum.
 *
 * Kept as a string literal alias (the enum's underlying value type) so any
 * concrete enum member is assignable to it.
 */
export type ResponseCodeLike = string;

/**
 * Structural counterpart of `@gertsai/api-core`'s `OrchestraApiResponse<CODE>`
 * class. Captures only the fields the envelope code reads — `info`, `data`,
 * `code`.
 *
 * The class instance from api-core satisfies this interface structurally,
 * so callers can pass real `OrchestraApiResponse<ResponseCode>` values
 * without any cast.
 */
export interface OrchestraApiResponseLike<CODE extends ResponseCodeLike = ResponseCodeLike> {
  readonly code: CODE;
  readonly data: unknown;
  readonly info: unknown;
}
