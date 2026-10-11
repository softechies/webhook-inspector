'use client';

import { useState, type ComponentProps } from 'react';

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--color-get)',
  POST: 'var(--color-post)',
  PUT: 'var(--color-put)',
  PATCH: 'var(--color-patch)',
  DELETE: 'var(--color-delete)',
};

export function methodColor(method: string): string {
  return METHOD_COLORS[method] ?? 'var(--color-other)';
}

export function MethodTag({ method }: { method: string }) {
  return (
    <span className="inline-block w-14 shrink-0 font-mono text-xs font-semibold" style={{ color: methodColor(method) }}>
      {method}
    </span>
  );
}

export function Button({ variant = 'primary', className = '', ...props }: ComponentProps<'button'> & { variant?: 'primary' | 'quiet' | 'danger' }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-[#343bb0] disabled:opacity-60',
    quiet: 'bg-panel text-ink ring-1 ring-line hover:bg-paper',
    danger: 'bg-panel text-delete ring-1 ring-line hover:bg-[#fbeceb]',
  }[variant];
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${styles} ${className}`} {...props} />;
}

export function CopyButton({ value, label = 'Copy', copiedLabel = 'Copied', className = '' }: { value: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="quiet"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-md border-0 bg-panel px-2.5 py-1.5 text-sm ring-1 ring-line focus:ring-2 focus:ring-accent focus:outline-none';
