/**
 * Mirror of backend ErrorCode enum (`app/core/error_codes.py`) + `FORBIDDEN_CHANNEL`.
 *
 * Requirements: RNF-13, Guidelines §5.6.
 * Note: Uses `const + as const + type` pattern for `erasableSyntaxOnly: true`.
 */

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  DISH_UNAVAILABLE: 'DISH_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  FORBIDDEN_CHANNEL: 'FORBIDDEN_CHANNEL',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
