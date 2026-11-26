/**
 * @file Centralized developer-mode diagnostic error classifier and logger.
 * @satisfies RNF-03, RNF-13
 */

import { ApiError } from './client.ts';
import { ErrorCode } from './errorCodes.ts';

/** Logical module scope shown in developer console diagnostics. */
export type DevFeatureScope =
  | 'KDS'
  | 'OrderTicket'
  | 'ReadyOrdersAlert'
  | 'IntermediateDishes'
  | 'WebSocket';

/** Normalized diagnostic category for REST, Zod, and WebSocket failures. */
export type DevErrorCategory =
  | 'CONNECTION'
  | 'AUTH_TOKEN'
  | 'FORBIDDEN_ACCESS'
  | 'NOT_FOUND'
  | 'STATE_OR_VERSION_CONFLICT'
  | 'DISH_UNAVAILABLE'
  | 'CONTRACT_VALIDATION'
  | 'WEBSOCKET'
  | 'UNEXPECTED';

/** Structured developer diagnostic metadata. */
export interface DevErrorDiagnostic {
  readonly category: DevErrorCategory;
  readonly prefix: string;
  readonly summary: string;
  readonly hint: string;
  readonly detailMessage: string;
}

interface CategoryTemplate {
  readonly label: string;
  readonly summary: string;
  readonly hint: string;
}

const ERROR_CODE_CATEGORY_MAP: Readonly<Record<string, DevErrorCategory>> = {
  [ErrorCode.UNAUTHENTICATED]: 'AUTH_TOKEN',
  [ErrorCode.FORBIDDEN_ROLE]: 'FORBIDDEN_ACCESS',
  [ErrorCode.FORBIDDEN_CHANNEL]: 'FORBIDDEN_ACCESS',
  [ErrorCode.ORDER_NOT_FOUND]: 'NOT_FOUND',
  [ErrorCode.INVALID_STATE_TRANSITION]: 'STATE_OR_VERSION_CONFLICT',
  [ErrorCode.VERSION_CONFLICT]: 'STATE_OR_VERSION_CONFLICT',
  [ErrorCode.DISH_UNAVAILABLE]: 'DISH_UNAVAILABLE',
  [ErrorCode.NOTE_REQUIRED]: 'CONTRACT_VALIDATION',
  [ErrorCode.VALIDATION_ERROR]: 'CONTRACT_VALIDATION',
  [ErrorCode.INTERNAL_ERROR]: 'CONNECTION',
};

const CATEGORY_TEMPLATES: Readonly<Record<DevErrorCategory, CategoryTemplate>> = {
  CONNECTION: {
    label: 'Error de conexión con el servidor',
    summary: 'No se pudo conectar con orders-backend (:8000) o el proxy Vite devolvió 502.',
    hint: 'Verifique que la API (uvicorn en :8000) y los contenedores de Docker estén encendidos.',
  },
  AUTH_TOKEN: {
    label: 'Error de autenticación JWT (401)',
    summary: 'Token faltante, expirado o firmado con secreto distinto.',
    hint: 'Verifique el tokenProvider provisto por el Shell, la vigencia/firma del JWT o JWT_SECRET.',
  },
  FORBIDDEN_ACCESS: {
    label: 'Acceso denegado por permisos/rol (403)',
    summary: 'El caller no posee rol o permiso PBAC requerido para esta acción.',
    hint: 'Revise los claims roles/permissions en el JWT y app/domain/access.py.',
  },
  NOT_FOUND: {
    label: 'Recurso o comanda no encontrado (404)',
    summary: 'El identificador consultado no existe en base de datos.',
    hint: 'Confirme que el orderId exista en Postgres o seleccione un preset/seed válido.',
  },
  STATE_OR_VERSION_CONFLICT: {
    label: 'Conflicto de estado o versión optimista (409)',
    summary: 'La orden cambió de estado o su versión optimista quedó desactualizada.',
    hint: 'Refresque la comanda para obtener la versión actual antes de reintentar.',
  },
  DISH_UNAVAILABLE: {
    label: 'Platillo u oferta no disponible en catálogo (422)',
    summary: 'El catálogo en Redis marca el sourceId/dishId u offerId como no disponible.',
    hint: 'Verifique disponibilidad en Menu/Inventory o cache catalog:platillo:* en Redis.',
  },
  CONTRACT_VALIDATION: {
    label: 'Error de validación o contrato de datos (400/422)',
    summary: 'El payload enviado o la respuesta no coincide con el esquema Zod/Pydantic.',
    hint: 'Inspeccione campos requeridos en shared/api/schemas.ts y logs del backend.',
  },
  WEBSOCKET: {
    label: 'Error en conexión WebSocket tiempo real',
    summary: 'Fallo al abrir o mantener la conexión hacia /ws/kds o /ws/waiter.',
    hint: 'Si orders-backend (:8000) está apagado es esperado; si corre, revise token y CORS.',
  },
  UNEXPECTED: {
    label: 'Error inesperado en módulo cliente',
    summary: 'Excepción no clasificada durante la operación.',
    hint: 'Revise el stack trace y la pestaña Network de DevTools para más detalle.',
  },
};

const CONNECTION_MESSAGE_PATTERN = /network|failed to fetch|econnrefused|timeout|socket|connection/i;

/** Classify any thrown REST, validation, or WebSocket error into a developer category. */
export function classifyDevError(error: unknown): DevErrorCategory {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status >= 500) {
      return 'CONNECTION';
    }
    return ERROR_CODE_CATEGORY_MAP[error.code] ?? 'UNEXPECTED';
  }
  if (error instanceof Error) {
    if (/websocket/i.test(error.message)) {
      return 'WEBSOCKET';
    }
    if (CONNECTION_MESSAGE_PATTERN.test(error.message)) {
      return 'CONNECTION';
    }
  }
  return 'UNEXPECTED';
}

/** Build structured diagnostic fields for a failed endpoint or interactive operation. */
export function buildDevErrorDiagnostic(
  scope: DevFeatureScope,
  endpointOrAction: string,
  error: unknown,
): DevErrorDiagnostic {
  const category = classifyDevError(error);
  const template = CATEGORY_TEMPLATES[category];
  const rawDetail = error instanceof Error ? error.message : String(error);
  const prefix = `[${scope}] ${template.label}:`;
  const detailMessage =
    error instanceof ApiError
      ? `${template.label} al cargar ${endpointOrAction} (status ${error.status}, code ${error.code}): ${rawDetail}`
      : `${template.label} al cargar ${endpointOrAction}: ${rawDetail}`;

  return {
    category,
    prefix,
    summary: template.summary,
    hint: template.hint,
    detailMessage,
  };
}

/** Wrap a failing query/endpoint error in DEV mode with explicit diagnostic context. */
export function toDeveloperEndpointError(
  scope: DevFeatureScope,
  endpoint: string,
  err: unknown,
): Error {
  const diagnostic = buildDevErrorDiagnostic(scope, endpoint, err);
  const enrichedMessage = `${diagnostic.detailMessage} — Sugerencia: ${diagnostic.hint}`;

  if (err instanceof ApiError) {
    return new ApiError(err.status, err.code, enrichedMessage, err.details ?? err);
  }
  return new Error(enrichedMessage, { cause: err });
}

/** Emit a categorized developer console diagnostic when running in development mode. */
export function logDeveloperError(
  scope: DevFeatureScope,
  endpointOrAction: string,
  error: unknown,
  isDev: boolean = import.meta.env.DEV,
): void {
  if (!isDev) {
    return;
  }
  const diagnostic = buildDevErrorDiagnostic(scope, endpointOrAction, error);
  console.error(diagnostic.prefix, error);
}

/** Emit an explanatory warning when a WebSocket closes abnormally or rejects credentials. */
export function logDeveloperWebSocketClose(
  endpoint: string,
  closeCode: number,
  wasReconnecting: boolean,
  isDev: boolean = import.meta.env.DEV,
): void {
  if (!isDev) {
    return;
  }
  if (closeCode === 4401) {
    console.warn(
      `[WebSocket] Cierre 4401 (UNAUTHENTICATED) en ${endpoint}: token ausente o expirado; intentando renovar e iniciar reconexión.`,
    );
    return;
  }
  if (closeCode === 4403) {
    console.warn(
      `[WebSocket] Cierre 4403 (FORBIDDEN_ROLE) en ${endpoint}: rol o permisos insuficientes; reconexión detenida.`,
    );
    return;
  }
  if (!wasReconnecting) {
    console.warn(
      `[WebSocket] Sin conexión con ${endpoint} (code=${closeCode}). Si el backend (:8000) o Docker están apagados, este intento fallido es normal mientras reintenta en segundo plano.`,
    );
  }
}
