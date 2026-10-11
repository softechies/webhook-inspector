import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Webhook Inspector', template: '%s · Webhook Inspector' },
  description: 'Catch, inspect and replay webhooks on your own server.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <rect x="1" y="4" width="4" height="14" rx="1" fill="var(--color-get)" />
                <rect x="7" y="2" width="4" height="18" rx="1" fill="var(--color-post)" />
                <rect x="13" y="6" width="4" height="10" rx="1" fill="var(--color-put)" />
                <rect x="19" y="8" width="2" height="6" rx="1" fill="var(--color-delete)" />
              </svg>
              Webhook Inspector
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
