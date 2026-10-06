import { NextRequest, NextResponse } from 'next/server';

import { ApiError, asApiError, httpStatusFor } from '@/lib/errors';
import { resetRefreshState, bumpSessionGeneration } from '@/lib/refresh-lock';
import { setDeviceIdCookie, setProfileCookie, setSessionCookies } from '@/lib/session-cookies';
import { backendRequest } from '@/lib/session';
import { hasWebRequestHeader } from '@/lib/web-request';
import { resolveDeviceIdentity } from '@/lib/web-device';

/**
 * The student app admits students.
 *
 * The backend authenticates all four roles on this endpoint, so without a check
 * here a teacher or administrator who signs in to the student site gets a
 * session cookie and then a blank student dashboard: every student-only route
 * answers `INSUFFICIENT_ROLE` and there is no staff surface in this app to fall
 * back to. That is a confusing dead end rather than a security hole — the
 * RolesGuard still guards the data — but it is wrong, and the staff dashboard
 * already gets it right (`edu-dashboard/.../src/lib/session.ts:90-106`).
 *
 * Mirroring that check makes the client-side split symmetric: each app admits
 * exactly the roles it can actually serve.
 */
const STUDENT_ONLY_MESSAGE =
  'This site is for student accounts only. Staff accounts sign in to the staff dashboard.';

export async function POST(request: NextRequest) {
  if (!hasWebRequestHeader(request.headers)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'CSRF_PROTECTION', message: 'CSRF protection' },
        code: 'CSRF_PROTECTION',
        message: 'CSRF protection',
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const identity = await resolveDeviceIdentity(request);
    const result = await backendRequest<{
      user: {
        id: string;
        fullName: string;
        phone: string;
        role: string;
        status: string;
        avatarUrl?: string | null;
      };
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>({
      method: 'POST',
      path: '/auth/login',
      body,
      deviceId: identity.deviceId,
      device: identity.device,
    });

    const { user, accessToken, refreshToken } = result.data;

    if (user.role !== 'STUDENT') {
      throw new ApiError({
        code: 'INSUFFICIENT_ROLE',
        status: 403,
        message: STUDENT_ONLY_MESSAGE,
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new ApiError({
        code: 'ACCOUNT_DISABLED',
        status: 403,
        message: 'This account is not active.',
      });
    }

    const response = NextResponse.json({
      success: true,
      data: { user },
    });

    // Any refresh still in flight belongs to the previous session and must not be
    // able to write its result over the tokens set below.
    bumpSessionGeneration();

    // A fresh sign-in starts unencumbered: any cooldown left over from a
    // previous session must not suppress this session's first refresh.
    resetRefreshState();

    setSessionCookies(response, { accessToken, refreshToken });

    // Persisted on the response that bound it, so the next sign-in presents the
    // same device instead of registering a new one and — on a one-device
    // account — parking the student in PENDING_APPROVAL.
    if (identity.isNew) setDeviceIdCookie(response, identity.deviceId);

    setProfileCookie(response, user);

    return response;
  } catch (e) {
    const apiErr = asApiError(e);
    return NextResponse.json(
      {
        success: false,
        error: { code: apiErr.code, message: apiErr.message, fields: apiErr.errors },
        statusCode: apiErr.status,
        code: apiErr.code,
        message: apiErr.message,
        errors: apiErr.errors,
      },
      { status: httpStatusFor(apiErr) }
    );
  }
}
