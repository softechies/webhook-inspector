import { bytesToBase64 } from './format';
import { DEFAULT_RESPONSE, type BinResponse, type CapturedRequest } from './store';

/** Request as sent to the browser: the body travels as base64 so binary payloads survive. */
export interface RequestDetail extends Omit<CapturedRequest, 'body'> {
  bodyBase64: string;
}

export function toDetail(request: CapturedRequest): RequestDetail {
  const { body, ...rest } = request;
  return { ...rest, bodyBase64: bytesToBase64(body) };
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(what = 'Not found'): Response {
  return Response.json({ error: what }, { status: 404 });
}

/** Validates the response settings sent from the UI. Returns an error message or the clean value. */
export function parseBinResponse(input: unknown): BinResponse | string {
  if (!input || typeof input !== 'object') return 'response must be an object';
  const value = input as Record<string, unknown>;

  const status = Number(value.status ?? DEFAULT_RESPONSE.status);
  if (!Number.isInteger(status) || status < 200 || status > 599) return 'status must be between 200 and 599';

  const delayMs = Number(value.delayMs ?? 0);
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 30_000) return 'delayMs must be 0 to 30000';

  const body = String(value.body ?? '');
  if (body.length > 100_000) return 'body must be under 100 KB';

  const headers: Record<string, string> = {};
  const rawHeaders = value.headers ?? {};
  if (typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) return 'headers must be an object';
  for (const [name, headerValue] of Object.entries(rawHeaders as Record<string, unknown>)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return `"${name}" is not a valid header name`;
    headers[name] = String(headerValue);
  }

  return { status, delayMs: Math.round(delayMs), body, headers };
}
