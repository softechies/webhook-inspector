'use client';

import { useState } from 'react';
import type { Bin } from '@/lib/store';
import { Button, Field, inputClass } from './ui';

/** What the URL answers with. Useful for testing how a sender handles errors, retries and slow endpoints. */
export function ResponseSettings({ bin, onSaved }: { bin: Bin; onSaved: (bin: Bin) => void }) {
  const [status, setStatus] = useState(String(bin.response.status));
  const [delayMs, setDelayMs] = useState(String(bin.response.delayMs));
  const [body, setBody] = useState(bin.response.body);
  const [headers, setHeaders] = useState(
    Object.entries(bin.response.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedHeaders: Record<string, string> = {};
    for (const line of headers.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const colon = line.indexOf(':');
      if (colon < 1) {
        setError(`"${line}" should look like Name: value`);
        return;
      }
      parsedHeaders[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }

    setSaving(true);
    setError(null);
    const response = await fetch(`/api/bins/${bin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: { status: Number(status), delayMs: Number(delayMs), body, headers: parsedHeaders } }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(((await response.json()) as { error?: string }).error ?? 'Could not save');
      return;
    }
    onSaved((await response.json()) as Bin);
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h2 className="font-semibold">Response sent back to the caller</h2>
      <p className="mt-1 text-sm text-muted">Return an error or a slow answer to see how the sender retries.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_10rem_1fr]">
        <Field label="Status">
          <input className={inputClass} inputMode="numeric" value={status} onChange={(e) => setStatus(e.target.value)} />
        </Field>
        <Field label="Delay (ms)" hint="Up to 30000">
          <input className={inputClass} inputMode="numeric" value={delayMs} onChange={(e) => setDelayMs(e.target.value)} />
        </Field>
        <Field label="Headers" hint="One per line">
          <textarea className={`${inputClass} font-mono`} rows={2} value={headers} onChange={(e) => setHeaders(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Body">
          <textarea className={`${inputClass} font-mono`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save response'}</Button>
        {error && <p role="alert" className="text-sm text-delete">{error}</p>}
      </div>
    </div>
  );
}
