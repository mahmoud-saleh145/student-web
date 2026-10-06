export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  errors?: Record<string, string[]>;
  requestId?: string;
}

export type ApiErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'SERVER_UNREACHABLE'
  | 'SERVER_ERROR'
  | 'UNKNOWN'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'MAINTENANCE'
  | 'APP_UPDATE_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_PENDING'
  | 'PHONE_ALREADY_REGISTERED'
  | 'DEVICE_NOT_AUTHORIZED'
  | 'DEVICE_LIMIT_REACHED'
  | 'DEVICE_CHANGE_PENDING'
  | 'DEVICE_INTEGRITY_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'COURSE_NOT_AVAILABLE'
  | 'COURSE_NOT_TARGETED'
  | 'COURSE_ARCHIVED'
  | 'ACCESS_EXPIRED'
  | 'NOT_ENROLLED'
  | 'ENROLLMENT_PENDING'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'INVALID_CODE'
  | 'CODE_ALREADY_USED'
  | 'ALREADY_ENROLLED'
  | 'INSUFFICIENT_CREDIT'
  | 'WALLET_LOCKED'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'CODE_NOT_RECHARGEABLE'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'STORAGE_UNAVAILABLE'
  | 'UPLOAD_FAILED'
  | 'INSUFFICIENT_ROLE'
  | 'PLAYBACK_DENIED'
  | 'PLAYBACK_TICKET_EXPIRED'
  | 'CONCURRENT_STREAM_LIMIT'
  | 'VIDEO_WATCH_LIMIT_REACHED'
  | 'VIDEO_PROCESSING_FAILED'
  | 'VIDEO_NOT_READY'
  | 'VIDEO_UNAVAILABLE'
  | 'CAPTURE_DETECTED';

export interface RequestOptions {
  signal?: AbortSignal;
  anonymous?: boolean;
  skipRefresh?: boolean;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}
