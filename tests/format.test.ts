import { describe, expect, it, vi } from 'vitest';
import { base64ToBytes, bytesToBase64, decodeBody, formatBytes, hexDump, shellQuote, timeAgo, toCurl } from '@/lib/format';
import { replay } from '@/lib/replay';

const enc = (s: string) => new TextEncoder().encode(s);

describe('decodeBody', () => {
  it('pretty prints JSON', () => {
    expect(decodeBody(enc('{"a":1}'), 'application/json')).toEqual({ kind: 'json', text: '{\n  "a": 1\n}' });
  });

  it('detects JSON without a content type', () => {
    expect(decodeBody(enc('[1,2]'), '').kind).toBe('json');
  });

  it('splits form bodies into fields', () => {
    const view = decodeBody(enc('pp_Amount=125000&pp_TxnRefNo=T1'), 'application/x-www-form-urlencoded');
    expect(view).toMatchObject({ kind: 'form', fields: [['pp_Amount', '125000'], ['pp_TxnRefNo', 'T1']] });
  });

  it('shows text, binary and empty bodies', () => {
    expect(decodeBody(enc('hello'), 'text/plain')).toEqual({ kind: 'text', text: 'hello' });
    expect(decodeBody(new Uint8Array([0, 1, 2]), 'application/octet-stream').kind).toBe('binary');
    expect(decodeBody(new Uint8Array(), '')).toEqual({ kind: 'empty' });
  });

  it('falls back to text for broken JSON', () => {
    expect(decodeBody(enc('{nope'), 'application/json').kind).toBe('text');
  });
});

describe('hexDump', () => {
  it('prints offset, hex and ASCII columns', () => {
    expect(hexDump(enc('AB\n'))).toBe('00000000  41 42 0a' + ' '.repeat(39) + '  AB.');
  });

  it('notes bytes past the limit', () => {
    expect(hexDump(new Uint8Array(40), 16).split('\n').at(-1)).toBe('… 24 more bytes');
  });
});

describe('toCurl', () => {
  it('keeps sender headers, drops proxy headers and quotes safely', () => {
    const curl = toCurl(
      {
        method: 'POST',
        headers: [['host', 'x'], ['x-forwarded-for', '1.2.3.4'], ['content-type', 'application/json'], ['x-note', "it's"]],
        body: enc('{"a":1}'),
      },
      'http://localhost:3000/api/hook',
    );
    expect(curl).toBe(
      [
        "curl -X POST 'http://localhost:3000/api/hook'",
        "-H 'content-type: application/json'",
        "-H 'x-note: it'\\''s'",
        `--data-binary '{"a":1}'`,
      ].join(' \\\n  '),
    );
  });

  it('points binary bodies at a file', () => {
    expect(toCurl({ method: 'PUT', headers: [], body: new Uint8Array([0, 1]) }, 'http://x')).toContain('--data-binary @body.bin');
  });

  it('shellQuote wraps in single quotes', () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe('small helpers', () => {
  it('formats sizes', () => {
    expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(['12 B', '2.0 KB', '3.0 MB']);
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(timeAgo('2026-01-01T11:59:58Z', now)).toBe('just now');
    expect(timeAgo('2026-01-01T11:59:30Z', now)).toBe('30s ago');
    expect(timeAgo('2026-01-01T11:55:00Z', now)).toBe('5m ago');
    expect(timeAgo('2026-01-01T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2025-12-30T12:00:00Z', now)).toBe('2d ago');
  });

  it('round trips base64, including large bodies', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('replay', () => {
  const captured = { method: 'POST', headers: [['content-type', 'application/json'], ['host', 'old']] as Array<[string, string]>, body: enc('{"a":1}') };

  it('sends the same method, headers and body', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 202, statusText: 'Accepted' }));
    const result = await replay(captured, 'http://localhost:3000/hook', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toMatchObject({ ok: true, status: 202, statusText: 'Accepted', body: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://localhost:3000/hook');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual([['content-type', 'application/json']]);
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{"a":1}');
  });

  it('rejects bad URLs before sending', async () => {
    expect((await replay(captured, 'not a url')).error).toMatch(/full URL/);
    expect((await replay(captured, 'file:///etc/passwd')).error).toMatch(/Only http/);
  });

  it('explains a refused connection', async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });
    const result = await replay(captured, 'http://localhost:4999/', { fetch: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, error: 'Connection refused: is anything listening on localhost:4999?' });
  });
});
