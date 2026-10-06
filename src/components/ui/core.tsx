'use client';

import * as React from 'react';

import { formatPercent } from '@/lib/format';
import { useTranslation } from '@/lib/session-context';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'onPlate';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:brightness-110 active:brightness-95',
  secondary: 'border border-border-strong bg-surface text-foreground hover:bg-surface-alt',
  ghost: 'text-muted hover:bg-surface-alt hover:text-foreground',
  danger: 'bg-danger text-white hover:brightness-110',
  link: 'text-primary-ink underline-offset-4 hover:underline px-0',
  onPlate: 'bg-highlight-fg text-highlight hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-[15px]',
  icon: 'h-9 w-9',
};

const baseButton =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55';

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(baseButton, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(baseButton, 'h-9 w-9 text-muted hover:bg-surface-alt hover:text-foreground', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  onClick,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  padded?: boolean;
}) {
  const shell = cn(
    'rounded-xl border border-border bg-surface transition-colors',
    padded && 'p-5',
    onClick && 'cursor-pointer text-start hover:border-border-strong hover:bg-surface-alt/60',
    className
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={cn('block w-full', shell)}>
        {children}
      </button>
    );
  }
  return <div className={shell}>{children}</div>;
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold">{children}</h2>
      {action}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  primary: 'bg-primary-soft text-primary-ink',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-surface-alt text-muted',
};

export function Badge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        badgeTones[tone],
        className
      )}
    >
      {label}
    </span>
  );
}

export function Chip({
  label,
  selected,
  onClick,
  count,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={!!selected}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface text-muted hover:border-border-strong hover:text-foreground'
      )}
    >
      {label}
      {typeof count === 'number' ? (
        <span className={cn('text-[11px] font-bold', selected ? 'text-primary-fg' : 'text-subtle')}>{count}</span>
      ) : null}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-alt/60 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
            value === o.value ? 'bg-surface text-foreground shadow-xs' : 'text-muted hover:text-foreground'
          )}
        >
          {o.label}
          {typeof o.count === 'number' ? <span className="text-[11px] text-subtle">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  percent,
  showLabel,
  className,
  tone = 'primary',
}: {
  percent: number;
  showLabel?: boolean;
  className?: string;
  tone?: 'primary' | 'success';
}) {
  const { language } = useTranslation();
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={cn('w-full', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', tone === 'success' ? 'bg-success' : 'bg-primary')}
          style={{ width: `${p}%` }}
        />
      </div>
      {showLabel ? (
        <div className="mt-1 text-xs font-medium text-muted">{formatPercent(p, language)}</div>
      ) : null}
    </div>
  );
}

export function Spinner({ label, fullscreen }: { label?: string; fullscreen?: boolean }) {
  const inner = (
    <div className="flex items-center justify-center gap-3 py-12">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label ? <span className="text-sm text-muted">{label}</span> : null}
    </div>
  );
  if (fullscreen) return <div className="flex min-[50vh] items-center justify-center">{inner}</div>;
  return inner;
}

export function Skeleton({ className, height }: { className?: string; height?: number }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-alt', className)} style={height ? { height } : undefined} />;
}

export function Avatar({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  if (uri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uri}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-fg"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

export function Stat({
  icon,
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning';
  hint?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-alt text-muted',
    primary: 'bg-primary-soft text-primary-ink',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      {icon ? <span className={cn('grid h-10 w-10 place-items-center rounded-lg', tones[tone])}>{icon}</span> : null}
      <div className="min-w-0">
        <div className="truncate text-lg font-bold leading-tight">{value}</div>
        <div className="truncate text-xs text-muted">{label}</div>
        {hint ? <div className="truncate text-[11px] text-subtle">{hint}</div> : null}
      </div>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className="text-end text-[13px] font-semibold">{children}</span>
    </div>
  );
}