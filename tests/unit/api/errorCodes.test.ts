import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { getErrorMessage, getTypedErrorMessage } from '../../../src/shared/i18n/translate.ts';

describe('UT-FE-13: ErrorCode catalogue and i18n mapping', () => {
  it('contains all required canonical error codes including FORBIDDEN_CHANNEL', () => {
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
    expect(ErrorCode.FORBIDDEN_ROLE).toBe('FORBIDDEN_ROLE');
    expect(ErrorCode.ORDER_NOT_FOUND).toBe('ORDER_NOT_FOUND');
    expect(ErrorCode.INVALID_STATE_TRANSITION).toBe('INVALID_STATE_TRANSITION');
    expect(ErrorCode.VERSION_CONFLICT).toBe('VERSION_CONFLICT');
    expect(ErrorCode.NOTE_REQUIRED).toBe('NOTE_REQUIRED');
    expect(ErrorCode.DISH_UNAVAILABLE).toBe('DISH_UNAVAILABLE');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCode.FORBIDDEN_CHANNEL).toBe('FORBIDDEN_CHANNEL');
  });

  it('maps every canonical ErrorCode to a localized Spanish message', () => {
    const codes = Object.values(ErrorCode);

    for (const code of codes) {
      const message = getTypedErrorMessage(code);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      // Ensure backend raw code is not returned as message
      expect(message).not.toBe(code);
    }
  });

  it('returns fallback UNKNOWN_ERROR message for undefined or unknown codes', () => {
    expect(getErrorMessage(undefined)).toBe('Ocurrió un error inesperado.');
    expect(getErrorMessage('RANDOM_NON_EXISTENT_CODE')).toBe('Ocurrió un error inesperado.');
  });
});
