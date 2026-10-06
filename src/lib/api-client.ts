'use client';

import type { ApiErrorCode } from '@/types/api';
import { WEB_REQUEST_HEADER } from '@/lib/web-request';
import { useLanguageStore } from '@/store/stores';

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  errors?: Record<string, string[]>;
  requestId?: string;

  constructor(params: {
    code: ApiErrorCode;
    status: number;
    message: string;
    errors?: Record<string, string[]>;
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.errors = params.errors;
    this.requestId = params.requestId;
  }
}

interface BackendErrorBody {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[]>;
  };
  statusCode?: number;
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
  requestId?: string;
}

function toApiError(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as BackendErrorBody;
  const code = (b.error?.code ?? b.code ?? 'UNKNOWN') as ApiErrorCode;
  const message = b.error?.message ?? b.message ?? 'Something went wrong';
  const errors = b.error?.fields ?? b.errors;
  const requestId = b.requestId;
  return new ApiError({ code, status, message, errors, requestId });
}

function networkError(kind: 'offline' | 'timeout' | 'unreachable'): ApiError {
  const code: ApiErrorCode =
    kind === 'offline' ? 'NETWORK_OFFLINE' : kind === 'timeout' ? 'NETWORK_TIMEOUT' : 'SERVER_UNREACHABLE';
  const message =
    kind === 'offline'
      ? 'No internet connection.'
      : kind === 'timeout'
        ? 'The request took too long.'
        : 'Cannot reach the server.';
  return new ApiError({ code, status: 0, message });
}

export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error) {
    return new ApiError({ code: 'UNKNOWN', status: 0, message: e.message });
  }
  return new ApiError({ code: 'UNKNOWN', status: 0, message: String(e) });
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`/api/proxy/${path.replace(/^\/+/, '')}`, window.location.origin);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers[WEB_REQUEST_HEADER] = '1';
  // The app's language, not the browser's: the backend localises content from it.
  headers['accept-language'] = useLanguageStore.getState().language;
  Object.assign(headers, options.headers ?? {});

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    throw networkError(offline ? 'offline' : 'unreachable');
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    throw toApiError(res.status, parsed);
  }

  const envelope = parsed as { success?: boolean; data?: T } | null;
  const hasEnvelope = envelope !== null && typeof envelope === 'object' && 'data' in envelope;
  return (hasEnvelope ? envelope.data : parsed) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
