'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  headerClassName?: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  mobile,
  empty = '',
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobile: (row: T) => React.ReactNode;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  if (!rows.length) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">{empty}</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt/50">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-start text-[11px] font-bold uppercase tracking-wider text-muted',
                    c.headerClassName
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-alt/60'
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="rounded-xl border border-border bg-surface p-4">
            {mobile(row)}
          </div>
        ))}
      </div>
    </>
  );
}

export function RowLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-end font-semibold">{children}</span>
    </div>
  );
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-4', className)}>{children}</div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}