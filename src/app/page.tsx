'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Spinner } from '@/components/ui/core';
import { useSession } from '@/lib/session-context';

export default function IndexPage() {
  const { status } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'authenticated') router.replace('/home');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-highlight">
      <Spinner />
    </div>
  );
}
