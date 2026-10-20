import type { ErrorCode } from '../api/errorCodes.ts';
import esTranslations from './es.json';

export type TranslationKey = keyof typeof esTranslations.errors;

export function getErrorMessage(code: string | undefined): string {
  if (!code) {
    return esTranslations.errors.UNKNOWN_ERROR;
  }
  const message = esTranslations.errors[code as keyof typeof esTranslations.errors];
  return message || esTranslations.errors.UNKNOWN_ERROR;
}

export function getTypedErrorMessage(code: ErrorCode): string {
  return getErrorMessage(code);
}

export function getRealtimeStatusMessage(key: keyof typeof esTranslations.realtime): string {
  return esTranslations.realtime[key] || '';
}

export { esTranslations };
