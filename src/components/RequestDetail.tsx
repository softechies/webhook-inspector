'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RequestDetail } from '@/lib/api';
import { base64ToBytes, decodeBody, formatBytes, toCurl } from '@/lib/format';
import type { ReplayResult } from '@/lib/replay';
import { PROVIDERS, verifyWebhookSignature, type Provider, type SignatureResult } from '@/lib/signature';
import type { RequestSummary } from '@/lib/store';
import { Button, CopyButton, Field, MethodTag, inputClass } from './ui';

type Tab = 'body' | 'headers' | 'query' | 'replay' | 'verify';

export function RequestDetailView({ summary, onDeleted }: { summary: RequestSummary; onDeleted: () => void }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [tab, setTab] = useState<Tab>('body');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/requests/${summary.id}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? setDetail((await r.json()) as RequestDetail) : setError('This request was deleted.')))
      .catch(() => setError('Could not load the request.'));
  }, [summary.id]);

  const body = useMemo(() => (detail ? base64ToBytes(detail.bodyBase64) : new Uint8Array()), [detail]);
  const query = useMemo(() => [...new URLSearchParams(summary.query).entries()], [summary.query]);

  async function remove() {
    await fetch(`/api/requests/${summary.id}`, { method: 'DELETE' });
    onDeleted();
  }

  const tabs: Array<[Tab, string]> = [
    ['body', 'Body'],
    ['headers', `Headers${detail ? ` (${detail.headers.length})` : ''}`],
    ['query', `Query${query.length ? ` (${query.length})` : ''}`],
    ['replay', 'Replay'],
    ['verify', 'Check signature'],
  ];

  return (
    <article className="rounded-lg bg-panel ring-1 ring-line">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <MethodTag method={summary.method} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{summary.path}{summary.query ? `?${summary.query}` : ''}</span>
        <button className="text-sm text-muted hover:text-delete" onClick={remove}>Delete</button>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Received</dt>
          <dd>{new Date(summary.receivedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted">Size</dt>
          <dd>{formatBytes(summary.bodySize)}{summary.truncated ? ' (cut)' : ''}</dd>
        </div>
        <div>
          <dt className="text-muted">Content type</dt>
          <dd className="truncate">{summary.contentType || 'none'}</dd>
        </div>
        <div>
          <dt className="text-muted">From</dt>
          <dd className="truncate">{summary.ip || 'unknown'}</dd>
        </div>
      </dl>

      <nav className="flex gap-1 overflow-x-auto border-b border-line px-2" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-ink aria-selected:border-accent aria-selected:text-ink"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="p-4">
        {error && <p className="text-sm text-delete">{error}</p>}
        {!detail && !error && <p className="text-sm text-muted">Loading…</p>}
        {detail && tab === 'body' && <BodyPanel body={body} contentType={detail.contentType} truncated={detail.truncated} />}
        {detail && tab === 'headers' && <PairsTable pairs={detail.headers} empty="No headers." />}
        {detail && tab === 'query' && <PairsTable pairs={query} empty="No query string." />}
        {detail && tab === 'replay' && <ReplayPanel detail={detail} body={body} />}
        {detail && tab === 'verify' && <VerifyPanel detail={detail} body={body} />}
      </div>
    </article>
  );
}

function BodyPanel({ body, contentType, truncated }: { body: Uint8Array; contentType: string; truncated: boolean }) {
  const view = useMemo(() => decodeBody(body, contentType), [body, contentType]);
  const raw = useMemo(() => new TextDecoder().decode(body), [body]);

  if (view.kind === 'empty') return <p className="text-sm text-muted">No body.</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {{ json: 'JSON, formatted', form: 'Form fields', text: 'Text', binary: 'Binary, shown as hex' }[view.kind]}
          {truncated ? '. Cut at the size limit.' : ''}
        </span>
        {view.kind !== 'binary' && <CopyButton value={raw} label="Copy raw body" />}
      </div>
      {view.kind === 'form' ? (
        <PairsTable pairs={view.fields} empty="" />
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-paper p-3 font-mono text-[13px] leading-relaxed">
          {view.kind === 'binary' ? view.hex : view.text}
        </pre>
      )}
    </div>
  );
}

function PairsTable({ pairs, empty }: { pairs: Array<[string, string]>; empty: string }) {
  if (pairs.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {pairs.map(([name, value], i) => (
          <tr key={`${name}-${i}`} className="border-b border-line last:border-0 align-top">
            <th scope="row" className="w-1/3 py-1.5 pr-3 text-left font-mono font-medium break-all">{name}</th>
            <td className="py-1.5 font-mono break-all text-muted">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReplayPanel({ detail, body }: { detail: RequestDetail; body: Uint8Array }) {
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem('replay-url') ?? 'http://localhost:3000/api/webhooks';
    } catch {
      return 'http://localhost:3000/api/webhooks';
    }
  });
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [sending, setSending] = useState(false);
  const curl = toCurl({ method: detail.method, headers: detail.headers, body }, url);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      localStorage.setItem('replay-url', url);
    } catch {
      // private mode: fine, the URL just isn't remembered
    }
    const response = await fetch(`/api/requests/${detail.id}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    setResult((await response.json()) as ReplayResult);
    setSending(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Send this request again, byte for byte, so signature checks still pass. The request is made from the inspector&apos;s
        server, so <span className="font-mono">localhost</span> means that machine.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={`${inputClass} font-mono`} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Target URL" />
        <Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send again'}</Button>
      </div>

      {result && (
        <div className="rounded-md ring-1 ring-line">
          <p className="border-b border-line px-3 py-2 text-sm">
            {result.error ? (
              <span className="text-delete">{result.error}</span>
            ) : (
              <>
                <span className={result.ok ? 'font-semibold text-get' : 'font-semibold text-delete'}>
                  {result.status} {result.statusText}
                </span>{' '}
                <span className="text-muted">in {result.durationMs} ms</span>
              </>
            )}
          </p>
          {result.body !== undefined && (
            <pre className="max-h-64 overflow-auto p-3 font-mono text-xs">{result.body || '(empty body)'}</pre>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">As a curl command</span>
          <CopyButton value={curl} label="Copy curl" />
        </div>
        <pre className="max-h-64 overflow-auto rounded-md bg-paper p-3 font-mono text-xs">{curl}</pre>
      </div>
    </div>
  );
}

function VerifyPanel({ detail, body }: { detail: RequestDetail; body: Uint8Array }) {
  const guess: Provider = detail.headers.some(([h]) => h === 'stripe-signature')
    ? 'stripe'
    : detail.headers.some(([h]) => h === 'x-shopify-hmac-sha256')
      ? 'shopify'
      : detail.headers.some(([h]) => h === 'x-slack-signature')
        ? 'slack'
        : detail.headers.some(([h]) => h === 'x-hub-signature-256')
          ? 'github'
          : 'custom';

  const [provider, setProvider] = useState<Provider>(guess);
  const [secret, setSecret] = useState('');
  const [header, setHeader] = useState('x-signature');
  const [encoding, setEncoding] = useState<'hex' | 'base64'>('hex');
  const [prefix, setPrefix] = useState('');
  const [result, setResult] = useState<SignatureResult | null>(null);

  async function check() {
    setResult(
      await verifyWebhookSignature(provider, secret, detail.headers, body, { header, algorithm: 'SHA-256', encoding, prefix }),
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Checks the HMAC signature with your webhook secret. It runs in your browser; the secret isn&apos;t sent anywhere.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sender">
          <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <option key={id} value={id}>{p.label}</option>
            ))}
            <option value="custom">Other (HMAC-SHA256)</option>
          </select>
        </Field>
        <Field label="Secret">
          <input className={`${inputClass} font-mono`} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
      </div>
      {provider === 'custom' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Signature header">
            <input className={`${inputClass} font-mono`} value={header} onChange={(e) => setHeader(e.target.value)} />
          </Field>
          <Field label="Encoding">
            <select className={inputClass} value={encoding} onChange={(e) => setEncoding(e.target.value as 'hex' | 'base64')}>
              <option value="hex">Hex</option>
              <option value="base64">Base64</option>
            </select>
          </Field>
          <Field label="Prefix" hint='e.g. "sha256="'>
            <input className={`${inputClass} font-mono`} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </Field>
        </div>
      )}
      <Button onClick={check} disabled={!secret}>Check signature</Button>

      {result && (
        <div className={`rounded-md p-3 text-sm ring-1 ${result.valid ? 'bg-[#e6f4f2] ring-[#b6ddd8]' : 'bg-[#fbeceb] ring-[#efc9c6]'}`}>
          <p className="font-semibold">{result.valid ? 'Signature matches.' : result.problem ?? 'Signature does not match.'}</p>
          {!result.valid && result.received && (
            <p className="mt-1 text-muted">
              Usually a different secret, or a body that was changed (re-serialised JSON, trimmed whitespace) before signing.
            </p>
          )}
          <dl className="mt-2 space-y-1 font-mono text-xs break-all">
            <div><dt className="inline text-muted">received </dt><dd className="inline">{result.received ?? 'none'}</dd></div>
            <div><dt className="inline text-muted">expected </dt><dd className="inline">{result.expected ?? 'n/a'}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
