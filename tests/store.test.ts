import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RESPONSE, newId, Store, type CapturedRequest } from '@/lib/store';

function sample(binId: string, receivedAt: string, body = '{"a":1}'): Omit<CapturedRequest, 'id'> {
  const bytes = new TextEncoder().encode(body);
  return {
    binId,
    receivedAt,
    method: 'POST',
    path: '/',
    query: 'x=1',
    headers: [['content-type', 'application/json']],
    body: bytes,
    bodySize: bytes.length,
    truncated: false,
    contentType: 'application/json',
    ip: '203.0.113.7',
  };
}

describe('Store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(':memory:', 3);
  });
  afterEach(() => store.close());

  it('creates, lists, renames and deletes bins', () => {
    const bin = store.createBin('  Stripe test  ');
    expect(bin.name).toBe('Stripe test');
    expect(bin.response).toEqual(DEFAULT_RESPONSE);
    expect(store.listBins().map((b) => b.id)).toEqual([bin.id]);

    const updated = store.updateBin(bin.id, { name: 'Renamed', response: { ...DEFAULT_RESPONSE, status: 500 } });
    expect(updated).toMatchObject({ name: 'Renamed', response: { status: 500 } });

    expect(store.deleteBin(bin.id)).toBe(true);
    expect(store.getBin(bin.id)).toBeNull();
    expect(store.deleteBin(bin.id)).toBe(false);
  });

  it('names an unnamed bin', () => {
    expect(store.createBin('   ').name).toBe('Untitled');
  });

  it('stores requests with their body bytes and counts them', () => {
    const bin = store.createBin('a');
    const saved = store.addRequest(sample(bin.id, '2026-01-01T00:00:00.000Z'));
    const loaded = store.getRequest(saved.id)!;
    expect(new TextDecoder().decode(loaded.body)).toBe('{"a":1}');
    expect(loaded.headers).toEqual([['content-type', 'application/json']]);
    expect(store.getBin(bin.id)).toMatchObject({ requestCount: 1, lastRequestAt: '2026-01-01T00:00:00.000Z' });
  });

  it('stores an empty body', () => {
    const bin = store.createBin('a');
    const saved = store.addRequest(sample(bin.id, '2026-01-01T00:00:00.000Z', ''));
    expect(store.getRequest(saved.id)!.body).toHaveLength(0);
  });

  it('keeps only the newest requests per bin', () => {
    const bin = store.createBin('a');
    for (let i = 1; i <= 5; i++) store.addRequest(sample(bin.id, `2026-01-01T00:00:0${i}.000Z`));
    const list = store.listRequests(bin.id);
    expect(list.map((r) => r.receivedAt)).toEqual([
      '2026-01-01T00:00:05.000Z',
      '2026-01-01T00:00:04.000Z',
      '2026-01-01T00:00:03.000Z',
    ]);
  });

  it('returns only newer requests when asked with after', () => {
    const bin = store.createBin('a');
    store.addRequest(sample(bin.id, '2026-01-01T00:00:01.000Z'));
    store.addRequest(sample(bin.id, '2026-01-01T00:00:02.000Z'));
    expect(store.listRequests(bin.id, { after: '2026-01-01T00:00:01.000Z' })).toHaveLength(1);
  });

  it('clears and deletes requests', () => {
    const bin = store.createBin('a');
    const one = store.addRequest(sample(bin.id, '2026-01-01T00:00:01.000Z'));
    store.addRequest(sample(bin.id, '2026-01-01T00:00:02.000Z'));
    expect(store.deleteRequest(one.id)).toBe(true);
    expect(store.clearBin(bin.id)).toBe(1);
    expect(store.listRequests(bin.id)).toEqual([]);
  });

  it('removes requests with their bin', () => {
    const bin = store.createBin('a');
    const saved = store.addRequest(sample(bin.id, '2026-01-01T00:00:01.000Z'));
    store.deleteBin(bin.id);
    expect(store.getRequest(saved.id)).toBeNull();
  });
});

describe('newId', () => {
  it('makes URL safe ids of the asked length', () => {
    expect(newId()).toMatch(/^[0-9a-z]{12}$/);
    expect(newId(16)).toHaveLength(16);
  });
});
