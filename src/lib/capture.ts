import type { BinResponse, CapturedRequest } from './store';

/** Headers added by proxies and the platform that say nothing about the sender's request. */
const HIDDEN_HEADERS = new Set(['x-middleware-subrequest', 'x-invoke-path', 'x-invoke-query', 'x-matched-path', 'x-next-cache-tags']);

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/**
 * Reads an incoming request into a record. Bodies over the limit are cut and flagged, so a
 * runaway sender can't fill the disk.
 */
export async function captureRequest(
  request: Request,
  binId: string,
  path: string,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Omit<CapturedRequest, 'id'>> {
  const url = new URL(request.url);
  const buffer = request.body ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array();
  const headers: Array<[string, string]> = [];
  request.headers.forEach((value, name) => {
    if (!HIDDEN_HEADERS.has(name)) headers.push([name, value]);
  });
  headers.sort((a, b) => a[0].localeCompare(b[0]));

  return {
    binId,
    receivedAt: new Date().toISOString(),
    method: request.method.toUpperCase(),
    path: path || '/',
    query: url.search.replace(/^\?/, ''),
    headers,
    body: buffer.length > maxBodyBytes ? buffer.slice(0, maxBodyBytes) : buffer,
    bodySize: buffer.length,
    truncated: buffer.length > maxBodyBytes,
    contentType: request.headers.get('content-type') ?? '',
    ip: clientIp(request.headers),
  };
}

/** First address in X-Forwarded-For, then X-Real-IP. Set by reverse proxies like Nginx or Caddy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? '';
}

/** The response a bin is configured to send back. */
export async function respond(config: BinResponse): Promise<Response> {
  if (config.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(config.delayMs, 60_000)));
  }
  const status = Number.isInteger(config.status) && config.status >= 200 && config.status <= 599 ? config.status : 200;
  const noBody = status === 204 || status === 304;
  return new Response(noBody ? null : config.body, { status, headers: config.headers });
}
