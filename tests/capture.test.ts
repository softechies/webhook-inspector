import { describe, expect, it } from 'vitest';
import { captureRequest, clientIp, respond } from '@/lib/capture';
import { parseBinResponse } from '@/lib/api';
import { DEFAULT_RESPONSE } from '@/lib/store';

describe('captureRequest', () => {
  it('records method, path, query, sorted headers and body', async () => {
    const request = new Request('http://localhost/h/abc/stripe/events?live=1&x=2', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.7, 10.0.0.1', Zeta: 'z' },
      body: '{"id":1}',
    });
    const captured = await captureRequest(request, 'abc', '/stripe/events');
    expect(captured).toMatchObject({
      binId: 'abc',
      method: 'POST',
      path: '/stripe/events',
      query: 'live=1&x=2',
      contentType: 'application/json',
      ip: '203.0.113.7',
      bodySize: 8,
      truncated: false,
    });
    expect(captured.headers.map(([name]) => name)).toEqual(['content-type', 'x-forwarded-for', 'zeta']);
    expect(new TextDecoder().decode(captured.body)).toBe('{"id":1}');
  });

  it('cuts bodies over the limit and keeps the real size', async () => {
    const request = new Request('http://localhost/h/abc', { method: 'POST', body: 'x'.repeat(50) });
    const captured = await captureRequest(request, 'abc', '', 10);
    expect(captured).toMatchObject({ path: '/', bodySize: 50, truncated: true });
    expect(captured.body).toHaveLength(10);
  });

  it('handles a GET with no body', async () => {
    const captured = await captureRequest(new Request('http://localhost/h/abc'), 'abc', '/');
    expect(captured.body).toHaveLength(0);
    expect(captured.bodySize).toBe(0);
  });
});

describe('clientIp', () => {
  it('falls back through the usual proxy headers', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers({ 'cf-connecting-ip': '198.51.100.3' }))).toBe('198.51.100.3');
    expect(clientIp(new Headers())).toBe('');
  });
});

describe('respond', () => {
  it('sends the configured status, headers and body', async () => {
    const response = await respond({ status: 503, headers: { 'Retry-After': '5' }, body: 'busy', delayMs: 0 });
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.text()).toBe('busy');
  });

  it('sends no body for 204', async () => {
    const response = await respond({ ...DEFAULT_RESPONSE, status: 204 });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('waits for the configured delay', async () => {
    const started = Date.now();
    await respond({ ...DEFAULT_RESPONSE, delayMs: 120 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });
});

describe('parseBinResponse', () => {
  it('accepts valid settings and fills defaults', () => {
    expect(parseBinResponse({ status: '500', body: 'no' })).toEqual({ status: 500, delayMs: 0, body: 'no', headers: {} });
  });

  it('rejects bad values with a message', () => {
    expect(parseBinResponse(null)).toBe('response must be an object');
    expect(parseBinResponse({ status: 99 })).toBe('status must be between 200 and 599');
    expect(parseBinResponse({ delayMs: 40_000 })).toBe('delayMs must be 0 to 30000');
    expect(parseBinResponse({ headers: { 'Bad Name': 'x' } })).toBe('"Bad Name" is not a valid header name');
    expect(parseBinResponse({ headers: ['x'] })).toBe('headers must be an object');
  });
});
