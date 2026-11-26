import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/shared/api/client.ts';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import {
  buildDevErrorDiagnostic,
  classifyDevError,
  logDeveloperError,
  logDeveloperWebSocketClose,
  toDeveloperEndpointError,
  type DevErrorCategory,
} from '../../../src/shared/api/devErrorLogger.ts';

describe('devErrorLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<{ label: string; error: unknown; expected: DevErrorCategory }>([
    {
      label: 'HTTP status 0 network failure',
      error: new ApiError(0, ErrorCode.INTERNAL_ERROR, 'Network error'),
      expected: 'CONNECTION',
    },
    {
      label: 'HTTP 502 proxy failure',
      error: new ApiError(502, ErrorCode.INTERNAL_ERROR, 'Bad Gateway'),
      expected: 'CONNECTION',
    },
    {
      label: 'UNAUTHENTICATED 401',
      error: new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Expired token'),
      expected: 'AUTH_TOKEN',
    },
    {
      label: 'FORBIDDEN_ROLE 403',
      error: new ApiError(403, ErrorCode.FORBIDDEN_ROLE, 'Missing permission'),
      expected: 'FORBIDDEN_ACCESS',
    },
    {
      label: 'FORBIDDEN_CHANNEL 403',
      error: new ApiError(403, ErrorCode.FORBIDDEN_CHANNEL, 'Channel denied'),
      expected: 'FORBIDDEN_ACCESS',
    },
    {
      label: 'ORDER_NOT_FOUND 404',
      error: new ApiError(404, ErrorCode.ORDER_NOT_FOUND, 'Missing order'),
      expected: 'NOT_FOUND',
    },
    {
      label: 'INVALID_STATE_TRANSITION 409',
      error: new ApiError(409, ErrorCode.INVALID_STATE_TRANSITION, 'Invalid state'),
      expected: 'STATE_OR_VERSION_CONFLICT',
    },
    {
      label: 'VERSION_CONFLICT 409',
      error: new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Stale version'),
      expected: 'STATE_OR_VERSION_CONFLICT',
    },
    {
      label: 'DISH_UNAVAILABLE 422',
      error: new ApiError(422, ErrorCode.DISH_UNAVAILABLE, 'Out of stock'),
      expected: 'DISH_UNAVAILABLE',
    },
    {
      label: 'NOTE_REQUIRED 422',
      error: new ApiError(422, ErrorCode.NOTE_REQUIRED, 'Note is required'),
      expected: 'CONTRACT_VALIDATION',
    },
    {
      label: 'VALIDATION_ERROR 400',
      error: new ApiError(400, ErrorCode.VALIDATION_ERROR, 'Bad payload'),
      expected: 'CONTRACT_VALIDATION',
    },
    {
      label: 'unknown ApiError code falls back to UNEXPECTED',
      error: new ApiError(418, 'UNMAPPED_CODE' as ErrorCode, 'Teapot'),
      expected: 'UNEXPECTED',
    },
    {
      label: 'Error mentioning WebSocket',
      error: new Error('WebSocket connection failed'),
      expected: 'WEBSOCKET',
    },
    {
      label: 'Error mentioning ECONNREFUSED',
      error: new Error('connect ECONNREFUSED 127.0.0.1:8000'),
      expected: 'CONNECTION',
    },
    {
      label: 'unclassified Error',
      error: new Error('Malformed component state'),
      expected: 'UNEXPECTED',
    },
    {
      label: 'non-Error primitive',
      error: 'raw failure string',
      expected: 'UNEXPECTED',
    },
  ])('classifies $label as $expected', ({ error, expected }) => {
    expect(classifyDevError(error)).toBe(expected);
  });

  it('builds structured diagnostic details for ApiError and primitive values', () => {
    const apiDiag = buildDevErrorDiagnostic(
      'OrderTicket',
      '/orders/ord-123',
      new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Token expired'),
    );
    expect(apiDiag.category).toBe('AUTH_TOKEN');
    expect(apiDiag.prefix).toBe('[OrderTicket] Error de autenticación JWT (401):');
    expect(apiDiag.hint).toContain('tokenProvider provisto por el Shell');
    expect(apiDiag.hint).not.toContain('localStorage');
    expect(apiDiag.detailMessage).toContain('/orders/ord-123 (status 401, code UNAUTHENTICATED)');

    const primitiveDiag = buildDevErrorDiagnostic('KDS', '/kds/queue?view=active', 'timeout');
    expect(primitiveDiag.category).toBe('UNEXPECTED');
    expect(primitiveDiag.detailMessage).toContain('al cargar /kds/queue?view=active: timeout');
  });

  it('wraps ApiError and generic Error in toDeveloperEndpointError preserving ApiError type', () => {
    const apiWithoutDetails = new ApiError(502, ErrorCode.INTERNAL_ERROR, 'Bad Gateway');
    const wrappedApi = toDeveloperEndpointError('KDS', '/kds/queue?view=active', apiWithoutDetails);
    expect(wrappedApi).toBeInstanceOf(ApiError);
    expect((wrappedApi as ApiError).status).toBe(502);
    expect((wrappedApi as ApiError).details).toBe(apiWithoutDetails);
    expect(wrappedApi.message).toContain('Error de conexión con el servidor');
    expect(wrappedApi.message).toContain('Sugerencia:');

    const apiWithDetails = new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Conflict', { version: 2 });
    const wrappedWithDetails = toDeveloperEndpointError('OrderTicket', '/orders/1', apiWithDetails);
    expect((wrappedWithDetails as ApiError).details).toEqual({ version: 2 });

    const generic = new Error('Failed to fetch');
    const wrappedGeneric = toDeveloperEndpointError('KDS', '/kds/queue?view=active', generic);
    expect(wrappedGeneric).not.toBeInstanceOf(ApiError);
    expect(wrappedGeneric.message).toContain('Sugerencia:');
    expect(wrappedGeneric.cause).toBe(generic);
  });

  it('logs developer errors only when isDev is true', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sampleError = new ApiError(500, ErrorCode.INTERNAL_ERROR, 'Proxy ECONNREFUSED');

    logDeveloperError('KDS', '/kds/queue?view=active', sampleError, false);
    expect(errorSpy).not.toHaveBeenCalled();

    logDeveloperError('KDS', '/kds/queue?view=active', sampleError, true);
    expect(errorSpy).toHaveBeenCalledWith('[KDS] Error de conexión con el servidor:', sampleError);
  });

  it('logs explanatory WebSocket close diagnostics by close code and dev flag', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logDeveloperWebSocketClose('ws://localhost:8000/ws/waiter', 1006, false, false);
    expect(warnSpy).not.toHaveBeenCalled();

    logDeveloperWebSocketClose('ws://localhost:8000/ws/waiter', 4401, false, true);
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining('Cierre 4401 (UNAUTHENTICATED)'));

    logDeveloperWebSocketClose('ws://localhost:8000/ws/kds', 4403, false, true);
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining('Cierre 4403 (FORBIDDEN_ROLE)'));

    logDeveloperWebSocketClose('ws://localhost:8000/ws/waiter', 1006, false, true);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining('Sin conexión con ws://localhost:8000/ws/waiter'));

    // Subsequent reconnect failures are suppressed to avoid console flooding
    logDeveloperWebSocketClose('ws://localhost:8000/ws/waiter', 1006, true, true);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});
