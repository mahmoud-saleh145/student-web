"use client";

import type { ApiErrorCode } from "@/types/api";
import { WEB_REQUEST_HEADER } from "@/lib/web-request";
import { useLanguageStore } from "@/store/stores";

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
    this.name = "ApiError";
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
  const code = (b.error?.code ?? b.code ?? "UNKNOWN") as ApiErrorCode;
  const message = b.error?.message ?? b.message ?? "Something went wrong";
  const errors = b.error?.fields ?? b.errors;
  const requestId = b.requestId;
  return new ApiError({ code, status, message, errors, requestId });
}

function networkError(kind: "offline" | "timeout" | "unreachable"): ApiError {
  const code: ApiErrorCode =
    kind === "offline"
      ? "NETWORK_OFFLINE"
      : kind === "timeout"
        ? "NETWORK_TIMEOUT"
        : "SERVER_UNREACHABLE";
  const message =
    kind === "offline"
      ? "No internet connection."
      : kind === "timeout"
        ? "The request took too long."
        : "Cannot reach the server.";
  return new ApiError({ code, status: 0, message });
}

export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error) {
    return new ApiError({ code: "UNKNOWN", status: 0, message: e.message });
  }
  return new ApiError({ code: "UNKNOWN", status: 0, message: String(e) });
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Query parameters, appended to the path.
   *
   * Nullish and empty values are skipped so a caller can pass an optional filter
   * straight through without building the query string by hand. This is also the
   * only route a value takes to the proxy — which matters for `GET
   * catalog/academic-selection?facultyId=…`, whose scope decides which college's
   * ladder comes back.
   */
  query?: Record<string, string | number | boolean | null | undefined>;
}

/** The learning website's proxy. The activation portal has its own. */
const DEFAULT_PROXY_BASE = "/api/proxy";

async function request<T>(
  base: string,
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(
    `${base}/${path.replace(/^\/+/, "")}`,
    window.location.origin,
  );

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers[WEB_REQUEST_HEADER] = "1";
  // The app's language, not the browser's: the backend localises content from it.
  headers["accept-language"] = useLanguageStore.getState().language;
  Object.assign(headers, options.headers ?? {});

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      credentials: "same-origin",
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    throw networkError(offline ? "offline" : "unreachable");
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
  const hasEnvelope =
    envelope !== null && typeof envelope === "object" && "data" in envelope;
  return (hasEnvelope ? envelope.data : parsed) as T;
}

export interface ApiClient {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

/**
 * A client bound to one same-origin proxy.
 *
 * `api` below is the learning website's, on `/api/proxy`. The activation
 * portal builds its own on `/api/activate/proxy`, which forwards only an
 * allow-list of routes and carries a separate session — so the two share the
 * request and error handling here without sharing a session or a route table.
 */
export function createApiClient(base: string): ApiClient {
  return {
    get: <T>(path: string, options?: RequestOptions) =>
      request<T>(base, "GET", path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(base, "POST", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(base, "PUT", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(base, "PATCH", path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>(base, "DELETE", path, options),
  };
}

export const api = createApiClient(DEFAULT_PROXY_BASE);
