import { ApiError, api } from '@/lib/api-client';
import type { User } from '@/types/domain';

/**
 * Profile picture upload — the same three steps as the mobile app's
 * `features/profile/avatar.ts`, against the same backend contract.
 *
 * The web version sent `{ contentType, filename }`. The backend's DTO is
 * `{ contentType, sizeBytes }` under a validation pipe that rejects unknown
 * fields, so every web upload failed before it reached storage. It also
 * ignored the `requiredHeaders` the presign returns.
 */

/** Exactly the backend's `@IsIn(IMAGE_TYPES)`. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** The backend's `@Max(5 * 1024 * 1024)` on `sizeBytes`. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export type AvatarProblem = 'unsupportedType' | 'tooLarge';

export function validateAvatar(file: { type: string; size: number }): AvatarProblem | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return 'unsupportedType';
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) return 'tooLarge';
  return null;
}

interface SignedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  requiredHeaders?: Record<string, string>;
}

export async function uploadAvatar(file: File): Promise<User> {
  const signed = await api.post<SignedUpload>('storage/uploads/avatar', {
    contentType: file.type,
    sizeBytes: file.size,
  });

  const headers = signed.requiredHeaders && Object.keys(signed.requiredHeaders).length > 0
    ? signed.requiredHeaders
    : { 'content-type': file.type };

  let response: Response;
  try {
    response = await fetch(signed.uploadUrl, { method: 'PUT', headers, body: file });
  } catch {
    throw new ApiError({ code: 'UPLOAD_FAILED', status: 0, message: 'The upload could not reach storage' });
  }
  if (!response.ok) {
    throw new ApiError({ code: 'UPLOAD_FAILED', status: response.status, message: `Storage refused the upload (${response.status})` });
  }

  return api.put<User>('profile/avatar', { avatarUrl: signed.objectKey });
}

export function removeAvatar(): Promise<User> {
  return api.put<User>('profile/avatar', { avatarUrl: null });
}
