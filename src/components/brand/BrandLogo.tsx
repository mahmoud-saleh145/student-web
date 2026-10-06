import Image from 'next/image';

import { cn } from '@/lib/utils';

import logo from '@/assets/brand/logo.png';
import logoMark from '@/assets/brand/logo-mark.png';

/**
 * The Student Center mark, as drawn.
 *
 * Every header and auth screen used to stand in a letter "S" on a coloured
 * square, which read as a placeholder because it was one. These are the same
 * files the mobile app ships, so the two clients carry the identical mark.
 *
 * `full` is the lockup — cog and wordmark — and already says "Student Center",
 * so callers drop the separate app-name text beside it. `mark` is the cog
 * alone, for places too tight for the wordmark.
 *
 * Sized by height: the lockup is roughly 1.9:1 and the cog nearly square, so a
 * fixed height keeps headers aligned whichever one is shown.
 */
export function BrandLogo({
  variant = 'full',
  height = 32,
  className,
  priority,
}: {
  variant?: 'full' | 'mark';
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const src = variant === 'full' ? logo : logoMark;
  const width = Math.round((src.width / src.height) * height);

  return (
    <Image
      src={src}
      alt="Student Center"
      width={width}
      height={height}
      priority={priority}
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  );
}
