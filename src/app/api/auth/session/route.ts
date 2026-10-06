import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ success: true, data: null });
  }

  return NextResponse.json({ success: true, data: user });
}
