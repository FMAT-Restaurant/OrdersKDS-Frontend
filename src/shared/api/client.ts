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

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly customFetch: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? '';
    this.tokenProvider = config.tokenProvider;
    this.customFetch = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const cleanBase = this.baseUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  private async buildHeaders(customHeaders?: HeadersInit): Promise<Headers> {
    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch (err) {
        console.warn('Failed to obtain token from tokenProvider:', err);
      }
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

export const apiClient = createApiClient();
