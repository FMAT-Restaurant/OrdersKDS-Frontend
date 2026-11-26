import type { z } from 'zod';
import { getErrorMessage } from '../i18n/translate.ts';
import type { TokenProvider } from '../types/auth.ts';
import { ErrorCode } from './errorCodes.ts';
import { ApiErrorResponseSchema } from './schemas.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface ApiClientConfig {
  baseUrl?: string;
  tokenProvider?: TokenProvider;
  fetchFn?: typeof fetch;
}

export function getStoredSessionToken(): string | null {
  if (!import.meta.env.DEV) return null;

  try {
    const raw = localStorage.getItem('fmat_restaurant_auth_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.accessToken || parsed.token || null;
  } catch {
    return null;
  }
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly customFetch: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? resolveDefaultApiBaseUrl();
    this.tokenProvider = config.tokenProvider;
    this.customFetch = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const cleanBase = stripTrailingSlashes(this.baseUrl);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  private async buildHeaders(customHeaders?: HeadersInit): Promise<Headers> {
    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let token: string | null = null;
    if (this.tokenProvider) {
      try {
        token = await this.tokenProvider();
      } catch (err) {
        console.warn('Failed to obtain token from tokenProvider:', err);
      }
    } else {
      token = getStoredSessionToken();
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let rawCode: string | undefined;
    let details: unknown;

    try {
      if (response.headers.get('content-type')?.includes('application/json')) {
        const json = await response.json();
        const parsed = ApiErrorResponseSchema.safeParse(json);
        if (parsed.success) {
          rawCode = parsed.data.error.code;
          details = parsed.data.error.details;
        }
      }
    } catch {
      // Body could not be parsed as JSON, fall back to status codes
    }

    let code: ErrorCode;
    if (rawCode && rawCode in ErrorCode) {
      code = rawCode as ErrorCode;
    } else {
      switch (response.status) {
        case 401:
          code = ErrorCode.UNAUTHENTICATED;
          break;
        case 403:
          code = ErrorCode.FORBIDDEN_ROLE;
          break;
        case 404:
          code = ErrorCode.ORDER_NOT_FOUND;
          break;
        case 409:
          code = ErrorCode.VERSION_CONFLICT;
          break;
        case 400:
        case 422:
          code = ErrorCode.VALIDATION_ERROR;
          break;
        default:
          code = ErrorCode.INTERNAL_ERROR;
      }
    }

    const localizedMessage = getErrorMessage(code);
    throw new ApiError(response.status, code, localizedMessage, details);
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    schema?: z.ZodType<T>,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const headers = await this.buildHeaders(options.headers);

    let response: Response;
    try {
      response = await this.customFetch(url, {
        ...options,
        headers,
      });
    } catch (networkErr) {
      throw new ApiError(
        0,
        ErrorCode.INTERNAL_ERROR,
        getErrorMessage('NETWORK_ERROR'),
        networkErr,
      );
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new ApiError(
        response.status,
        ErrorCode.VALIDATION_ERROR,
        getErrorMessage(ErrorCode.VALIDATION_ERROR),
        parseErr,
      );
    }

    if (schema) {
      const validationResult = schema.safeParse(data);
      if (!validationResult.success) {
        throw new ApiError(
          response.status,
          ErrorCode.VALIDATION_ERROR,
          getErrorMessage(ErrorCode.VALIDATION_ERROR),
          validationResult.error.issues,
        );
      }
      return validationResult.data;
    }

    return data as T;
  }

  get<T>(path: string, schema?: z.ZodType<T>, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' }, schema);
  }

  post<T>(path: string, body?: unknown, schema?: z.ZodType<T>, options?: RequestInit): Promise<T> {
    return this.request<T>(
      path,
      {
        ...options,
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      schema,
    );
  }

  patch<T>(path: string, body?: unknown, schema?: z.ZodType<T>, options?: RequestInit): Promise<T> {
    return this.request<T>(
      path,
      {
        ...options,
        method: 'PATCH',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      schema,
    );
  }

  put<T>(path: string, body?: unknown, schema?: z.ZodType<T>, options?: RequestInit): Promise<T> {
    return this.request<T>(
      path,
      {
        ...options,
        method: 'PUT',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      schema,
    );
  }

  delete<T>(path: string, schema?: z.ZodType<T>, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' }, schema);
  }
}

export function createApiClient(config?: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

function toBase64Url(obj: unknown): string {
  if (typeof btoa !== 'function') return '';
  let unpadded = btoa(JSON.stringify(obj));
  while (unpadded.endsWith('=')) {
    unpadded = unpadded.slice(0, -1);
  }
  return unpadded.replaceAll('+', '-').replaceAll('/', '_');
}

export function generateLocalDevToken(role = 'admin'): string {
  if (!import.meta.env.DEV) {
    return '';
  }
  const header = toBase64Url({ alg: 'HS256', typ: 'JWT' });
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
  const claims = toBase64Url({
    sub: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    role,
    roles: [role, 'chef', 'waiter'],
    permissions: ['*'],
    exp,
  });
  return `${header}.${claims}.devsignature`;
}

function resolveDynamicGatewayOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

function resolveGatewayPrefix(mode: string): string {
  return mode === 'cocina' ? '/api/v1/kitchen' : '/api/v1/orders';
}

function resolveConfiguredEnvUrl(raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') {
    return null;
  }
  return trimmed;
}

/** Resolve the default REST gateway URL for the active build mode. */
export function resolveDefaultApiBaseUrl(mode: string = import.meta.env.MODE): string {
  const configured =
    resolveConfiguredEnvUrl(import.meta.env.VITE_API_URL) ??
    resolveConfiguredEnvUrl(import.meta.env.VITE_API_BASE_URL);
  if (configured) {
    return configured;
  }
  return `${resolveDynamicGatewayOrigin()}${resolveGatewayPrefix(mode)}`;
}

/** Resolve the default WebSocket gateway URL from Vite env or active API gateway base URL. */
export function resolveDefaultWsBaseUrl(mode: string = import.meta.env.MODE): string {
  const configuredWs = resolveConfiguredEnvUrl(import.meta.env.VITE_WS_URL);
  if (configuredWs) {
    return configuredWs;
  }
  return resolveDefaultApiBaseUrl(mode).replace(/^http(s?):\/\//i, 'ws$1://');
}

export interface ResolveApiClientOptions {
  readonly client?: ApiClient;
  readonly baseUrl?: string;
  readonly tokenProvider?: TokenProvider;
}

const localApiBaseUrl = resolveDefaultApiBaseUrl();
const localDevToken = import.meta.env.DEV ? import.meta.env.VITE_API_TOKEN || null : null;

export const apiClient = createApiClient({
  baseUrl: localApiBaseUrl,
  tokenProvider: () => {
    const stored = getStoredSessionToken();
    return Promise.resolve(stored || localDevToken);
  },
});

/** Resolve an injected ApiClient or construct a scoped client with gateway defaults. */
export function resolveApiClient({
  client,
  baseUrl,
  tokenProvider,
}: Readonly<ResolveApiClientOptions> = {}): ApiClient {
  if (client) {
    return client;
  }
  if (tokenProvider || baseUrl !== undefined) {
    return new ApiClient({ baseUrl, tokenProvider });
  }
  return apiClient;
}
