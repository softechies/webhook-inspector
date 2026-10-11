/** Helpers shared by the UI and the API. No Node-only code, so they run in the browser too. */

export type BodyView =
  | { kind: 'empty' }
  | { kind: 'json'; text: string }
  | { kind: 'form'; fields: Array<[string, string]>; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'binary'; hex: string };

export function decodeBody(body: Uint8Array, contentType: string): BodyView {
  if (body.length === 0) return { kind: 'empty' };

  const text = new TextDecoder('utf-8', { fatal: false }).decode(body);
  const type = contentType.toLowerCase();

  if (type.includes('json') || /^\s*[[{]/.test(text)) {
    try {
      return { kind: 'json', text: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      // not JSON after all
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    return { kind: 'form', fields: [...new URLSearchParams(text).entries()], text };
  }

  if (looksBinary(body)) return { kind: 'binary', hex: hexDump(body) };
  return { kind: 'text', text };
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 512);
  let control = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / sample.length > 0.1;
}

/** Classic 16 bytes per row hex dump with an ASCII column. */
export function hexDump(bytes: Uint8Array, maxBytes = 4096): string {
  const rows: string[] = [];
  const end = Math.min(bytes.length, maxBytes);
  for (let offset = 0; offset < end; offset += 16) {
    const chunk = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    rows.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > maxBytes) rows.push(`… ${bytes.length - maxBytes} more bytes`);
  return rows.join('\n');
}

/** Headers that curl sets itself, or that would be wrong when the request is sent again. */
const SKIP_IN_CURL = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port', 'x-real-ip', 'cf-connecting-ip']);

/** A curl command that sends the same request to another URL (e.g. your local server). */
export function toCurl(
  request: { method: string; headers: Array<[string, string]>; body: Uint8Array },
  targetUrl: string,
): string {
  const parts = [`curl -X ${request.method} ${shellQuote(targetUrl)}`];
  for (const [name, value] of request.headers) {
    if (!SKIP_IN_CURL.has(name.toLowerCase())) parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (request.body.length > 0) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(request.body);
    parts.push(looksBinary(request.body) ? `--data-binary @body.bin` : `--data-binary ${shellQuote(text)}`);
  }
  return parts.join(' \\\n  ');
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Headers safe to forward when replaying: hop-by-hop and proxy headers are dropped. */
export function replayHeaders(headers: Array<[string, string]>): Array<[string, string]> {
  return headers.filter(([name]) => !SKIP_IN_CURL.has(name.toLowerCase()));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
