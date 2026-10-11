import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional password for the inspector UI and API. Set INSPECTOR_PASSWORD to turn it on.
 * Webhook URLs (/h/...) stay open, because the services sending them can't log in.
 */
export function proxy(request: NextRequest) {
  const password = process.env.INSPECTOR_PASSWORD;
  if (!password || request.nextUrl.pathname.startsWith('/h/')) return NextResponse.next();

  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(':') + 1);
    if (constantTimeEqual(given, password)) return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Webhook Inspector", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
