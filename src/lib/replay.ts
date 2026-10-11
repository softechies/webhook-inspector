import { replayHeaders } from './format';
import type { CapturedRequest } from './store';

export interface ReplayResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Array<[string, string]>;
  body?: string;
  bodyTruncated?: boolean;
  durationMs: number;
  error?: string;
}

const MAX_RESPONSE_CHARS = 64 * 1024;

/**
 * Sends a captured request again to another URL, typically your local or staging server,
 * with the same method, headers and body. Signatures stay valid because the body is byte for byte the same.
 */
export async function replay(
  request: Pick<CapturedRequest, 'method' | 'headers' | 'body'>,
  targetUrl: string,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<ReplayResult> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return { ok: false, durationMs: 0, error: 'Enter a full URL, e.g. http://localhost:3000/api/webhooks' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, durationMs: 0, error: 'Only http and https URLs can be replayed to' };
  }

  const started = performance.now();
  const hasBody = request.body.length > 0 && !['GET', 'HEAD'].includes(request.method);
  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: request.method,
      headers: replayHeaders(request.headers),
      ...(hasBody ? { body: request.body as BodyInit } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: text.slice(0, MAX_RESPONSE_CHARS),
      bodyTruncated: text.length > MAX_RESPONSE_CHARS,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } };
    const message =
      err.name === 'TimeoutError'
        ? 'Timed out'
        : err.cause?.code === 'ECONNREFUSED'
          ? `Connection refused: is anything listening on ${url.host}?`
          : err.message;
    return { ok: false, durationMs: Math.round(performance.now() - started), error: message };
  }
}
