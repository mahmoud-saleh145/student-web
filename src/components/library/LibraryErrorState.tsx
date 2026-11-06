'use client';

import { ErrorState } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api-client';
import { isRetryableLibraryError, libraryErrorKey, type LibraryErrorContext } from '@/lib/library';

/**
 * An error on a Library screen, in Library words.
 *
 * Retry is offered only where trying again could change the answer (a network
 * or server failure). A refusal — not available, revoked, withdrawn — is the
 * answer, and a Retry button beside it would only invite pointless repeats.
 */
export function LibraryErrorState({
  error,
  context,
  onRetry,
  compact,
}: {
  error: unknown;
  context: LibraryErrorContext;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const code = error instanceof ApiError ? error.code : undefined;
  const status = error instanceof ApiError ? error.status : undefined;
  return (
    <ErrorState
      error={error}
      compact={compact}
      messageKey={libraryErrorKey(code, status, context)}
      onRetry={onRetry && isRetryableLibraryError(code, status) ? onRetry : undefined}
    />
  );
}
