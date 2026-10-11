import { headers } from 'next/headers';

/** Public base URL of this inspector, for showing webhook URLs. PUBLIC_URL wins over the request's host. */
export async function publicOrigin(): Promise<string> {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
