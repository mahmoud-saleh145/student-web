'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link href="/home" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg">
        Go home
      </Link>
    </div>
  );
}
