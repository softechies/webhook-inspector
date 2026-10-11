import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BinResponse {
  status: number;
  /** Header name → value. */
  headers: Record<string, string>;
  body: string;
  /** Wait before answering, to test the sender's timeout handling. */
  delayMs: number;
}

export interface Bin {
  id: string;
  name: string;
  createdAt: string;
  response: BinResponse;
  requestCount: number;
  lastRequestAt: string | null;
}

export interface CapturedRequest {
  id: string;
  binId: string;
  receivedAt: string;
  method: string;
  /** Path after /h/{bin}, e.g. "/stripe/events". "/" when nothing follows. */
  path: string;
  /** Query string without the "?". */
  query: string;
  headers: Array<[string, string]>;
  body: Uint8Array;
  /** Original size; body is cut at the size limit. */
  bodySize: number;
  truncated: boolean;
  contentType: string;
  ip: string;
}

export type RequestSummary = Omit<CapturedRequest, 'body' | 'headers'>;

export const DEFAULT_RESPONSE: BinResponse = {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: '{"ok":true}',
  delayMs: 0,
};

const SCHEMA = `
  create table if not exists bins (
    id text primary key,
    name text not null,
    created_at text not null,
    response text not null
  );
  create table if not exists requests (
    id text primary key,
    bin_id text not null references bins (id) on delete cascade,
    received_at text not null,
    method text not null,
    path text not null,
    query text not null,
    headers text not null,
    body blob not null,
    body_size integer not null,
    truncated integer not null,
    content_type text not null,
    ip text not null
  );
  create index if not exists requests_bin_time on requests (bin_id, received_at desc);
`;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id, safe to put in a URL. 12 characters ≈ 62 bits. */
export function newId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * SQLite storage using Node's built-in driver, so there is nothing native to compile.
 * Each bin keeps its most recent requests up to a limit; older ones are dropped.
 */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string, private readonly maxRequestsPerBin = 500) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('pragma journal_mode = wal; pragma foreign_keys = on;');
    this.db.exec(SCHEMA);
  }

  createBin(name: string, response: BinResponse = DEFAULT_RESPONSE): Bin {
    const id = newId();
    const createdAt = new Date().toISOString();
    this.db.prepare('insert into bins (id, name, created_at, response) values (?, ?, ?, ?)').run(id, name.trim() || 'Untitled', createdAt, JSON.stringify(response));
    return { id, name: name.trim() || 'Untitled', createdAt, response, requestCount: 0, lastRequestAt: null };
  }

  listBins(): Bin[] {
    const rows = this.db.prepare(`
      select b.*, count(r.id) as request_count, max(r.received_at) as last_request_at
      from bins b left join requests r on r.bin_id = b.id
      group by b.id order by b.created_at desc
    `).all() as Array<Record<string, unknown>>;
    return rows.map(toBin);
  }

  getBin(id: string): Bin | null {
    const row = this.db.prepare(`
      select b.*, (select count(*) from requests where bin_id = b.id) as request_count,
             (select max(received_at) from requests where bin_id = b.id) as last_request_at
      from bins b where b.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? toBin(row) : null;
  }

  updateBin(id: string, changes: { name?: string; response?: BinResponse }): Bin | null {
    const bin = this.getBin(id);
    if (!bin) return null;
    this.db.prepare('update bins set name = ?, response = ? where id = ?').run(
      changes.name?.trim() || bin.name,
      JSON.stringify(changes.response ?? bin.response),
      id,
    );
    return this.getBin(id);
  }

  deleteBin(id: string): boolean {
    this.db.prepare('delete from requests where bin_id = ?').run(id);
    return Number(this.db.prepare('delete from bins where id = ?').run(id).changes) > 0;
  }

  addRequest(request: Omit<CapturedRequest, 'id'>): CapturedRequest {
    const id = newId(16);
    this.db.prepare(`
      insert into requests (id, bin_id, received_at, method, path, query, headers, body, body_size, truncated, content_type, ip)
      values (?, ?, ?, ?, ?, ?, ?, coalesce(?, x''), ?, ?, ?, ?)
    `).run(
      id, request.binId, request.receivedAt, request.method, request.path, request.query,
      JSON.stringify(request.headers), request.body, request.bodySize, request.truncated ? 1 : 0,
      request.contentType, request.ip,
    );

    // Keep only the newest requests for this bin.
    this.db.prepare(`
      delete from requests where bin_id = ? and id not in (
        select id from requests where bin_id = ? order by received_at desc, rowid desc limit ?
      )
    `).run(request.binId, request.binId, this.maxRequestsPerBin);

    return { id, ...request };
  }

  /** Newest first. Pass `after` (an ISO time) to get only requests that arrived since. */
  listRequests(binId: string, options: { after?: string; limit?: number } = {}): RequestSummary[] {
    const rows = this.db.prepare(`
      select id, bin_id, received_at, method, path, query, body_size, truncated, content_type, ip
      from requests where bin_id = ? and received_at > ?
      order by received_at desc, rowid desc limit ?
    `).all(binId, options.after ?? '', options.limit ?? 200) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      binId: String(r.bin_id),
      receivedAt: String(r.received_at),
      method: String(r.method),
      path: String(r.path),
      query: String(r.query),
      bodySize: Number(r.body_size),
      truncated: Boolean(r.truncated),
      contentType: String(r.content_type),
      ip: String(r.ip),
    }));
  }

  getRequest(id: string): CapturedRequest | null {
    const r = this.db.prepare('select * from requests where id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      binId: String(r.bin_id),
      receivedAt: String(r.received_at),
      method: String(r.method),
      path: String(r.path),
      query: String(r.query),
      headers: JSON.parse(String(r.headers)) as Array<[string, string]>,
      body: r.body ? new Uint8Array(r.body as Uint8Array) : new Uint8Array(),
      bodySize: Number(r.body_size),
      truncated: Boolean(r.truncated),
      contentType: String(r.content_type),
      ip: String(r.ip),
    };
  }

  deleteRequest(id: string): boolean {
    return Number(this.db.prepare('delete from requests where id = ?').run(id).changes) > 0;
  }

  clearBin(binId: string): number {
    return Number(this.db.prepare('delete from requests where bin_id = ?').run(binId).changes);
  }

  close(): void {
    this.db.close();
  }
}

function toBin(row: Record<string, unknown>): Bin {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    response: { ...DEFAULT_RESPONSE, ...(JSON.parse(String(row.response)) as Partial<BinResponse>) },
    requestCount: Number(row.request_count ?? 0),
    lastRequestAt: row.last_request_at ? String(row.last_request_at) : null,
  };
}

// One store per server process. Kept on globalThis so dev reloads don't open it repeatedly.
const globalStore = globalThis as unknown as { __webhookInspectorStore?: Store };

export function getStore(): Store {
  globalStore.__webhookInspectorStore ??= new Store(
    process.env.DATABASE_PATH ?? './data/inspector.db',
    Number(process.env.MAX_REQUESTS_PER_BIN ?? 500),
  );
  return globalStore.__webhookInspectorStore;
}
