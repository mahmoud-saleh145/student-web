'use client';

import * as React from 'react';

import { CloseIcon, EyeIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

export function Input({
  label,
  error,
  hint,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  return (
    <label className={cn('block', className)}>
      {label ? <span className="mb-1.5 block text-[13px] font-semibold">{label}</span> : null}
      <input
        className={cn(
          'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-subtle focus:border-primary',
          error ? 'border-danger' : 'border-border-strong'
        )}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="w-full" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute end-2 top-[38px] grid h-6 w-6 cursor-pointer place-items-center rounded text-muted transition hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <EyeIcon size={16} />
      </button>
    </div>
  );
}

export function TextArea({
  label,
  error,
  hint,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string }) {
  return (
    <label className={cn('block', className)}>
      {label ? <span className="mb-1.5 block text-[13px] font-semibold">{label}</span> : null}
      <textarea
        className={cn(
          'w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-subtle focus:border-primary',
          error ? 'border-danger' : 'border-border-strong'
        )}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Select({
  label,
  error,
  options,
  placeholder,
  className,
  value,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className={cn('block', className)}>
      {label ? <span className="mb-1.5 block text-[13px] font-semibold">{label}</span> : null}
      <select
        value={value}
        className={cn(
          'h-10 w-full cursor-pointer rounded-lg border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary',
          error ? 'border-danger' : 'border-border-strong'
        )}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-border-strong'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'start-[22px]' : 'start-0.5'
        )}
      />
    </button>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <div className="shrink-0 border-t border-border px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
