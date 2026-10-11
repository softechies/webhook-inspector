'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes, timeAgo } from '@/lib/format';
import type { Bin, RequestSummary } from '@/lib/store';
import { RequestDetailView } from './RequestDetail';
import { ResponseSettings } from './ResponseSettings';
import { Button, CopyButton, MethodTag, methodColor } from './ui';

const POLL_MS = 2000;

export function Inspector({ bin: initialBin, webhookUrl, initialRequests }: { bin: Bin; webhookUrl: string; initialRequests: RequestSummary[] }) {
  const router = useRouter();
  const [bin, setBin] = useState(initialBin);
  const [requests, setRequests] = useState(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ?? null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [, setTick] = useState(0); // re-renders the "2m ago" labels
  const latest = useRef(initialRequests[0]?.receivedAt ?? '');

  const poll = useCallback(async () => {
    const response = await fetch(`/api/bins/${bin.id}/requests${latest.current ? `?after=${encodeURIComponent(latest.current)}` : ''}`, { cache: 'no-store' });
    if (!response.ok) return;
    const incoming = (await response.json()) as RequestSummary[];
    if (incoming.length === 0) return;

    latest.current = incoming[0]!.receivedAt;
    setRequests((current) => [...incoming, ...current.filter((r) => !incoming.some((n) => n.id === r.id))].slice(0, 500));
    setFresh(new Set(incoming.map((r) => r.id)));
    setSelectedId((current) => current ?? incoming[0]!.id);
  }, [bin.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
      setTick((t) => t + 1);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  async function clearAll() {
    if (!confirm(`Delete all ${requests.length} captured requests?`)) return;
    await fetch(`/api/bins/${bin.id}/requests`, { method: 'DELETE' });
    setRequests([]);
    setSelectedId(null);
  }

  async function deleteBin() {
    if (!confirm(`Delete "${bin.name}" and everything it captured? The URL will stop working.`)) return;
    await fetch(`/api/bins/${bin.id}`, { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <section aria-label="Webhook URL" className="rounded-lg bg-panel p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{bin.name}</h1>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
              Response: {bin.response.status}
              {bin.response.delayMs > 0 ? `, ${bin.response.delayMs} ms delay` : ''}
            </Button>
            <Button variant="danger" onClick={deleteBin}>Delete URL</Button>
          </div>
        </div>
        <div className="mt-3 flex items-stretch gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-paper px-3 py-2 font-mono text-[15px]">{webhookUrl}</code>
          <CopyButton value={webhookUrl} label="Copy URL" />
        </div>
        <p className="mt-2 text-sm text-muted">
          Any method and any path under this URL is captured, e.g. <span className="font-mono break-all">{webhookUrl}/stripe</span>.
        </p>
        {showSettings && (
          <ResponseSettings
            bin={bin}
            onSaved={(updated) => {
              setBin(updated);
              setShowSettings(false);
            }}
          />
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-label="Captured requests" className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              Requests <span className="font-normal text-muted">({requests.length})</span>
            </h2>
            {requests.length > 0 && (
              <button className="text-sm text-muted hover:text-delete" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          {requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-panel p-5 text-sm">
              <p className="font-medium">Waiting for the first request.</p>
              <p className="mt-1 text-muted">Send one from your terminal to try it:</p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-paper p-3 font-mono text-xs">{`curl -X POST ${webhookUrl} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"event":"order.paid","id":1042}'`}</pre>
              <p className="mt-3 text-muted">This page checks for new requests every two seconds.</p>
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto rounded-lg bg-panel ring-1 ring-line">
              {requests.map((r) => (
                <li key={r.id} className={fresh.has(r.id) ? 'arrived' : ''}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    aria-current={r.id === selectedId}
                    className="relative flex w-full items-center gap-2 py-2.5 pr-3 pl-4 text-left hover:bg-paper aria-[current=true]:bg-accent-soft"
                  >
                    <span className="absolute inset-y-0 left-0 w-1" style={{ background: methodColor(r.method) }} aria-hidden="true" />
                    <MethodTag method={r.method} />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                      {r.path}
                      {r.query ? `?${r.query}` : ''}
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">
                      {timeAgo(r.receivedAt)}
                      <br />
                      {formatBytes(r.bodySize)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Request details" className="min-w-0">
          {selected ? (
            <RequestDetailView
              key={selected.id}
              summary={selected}
              onDeleted={() => {
                setRequests((current) => current.filter((r) => r.id !== selected.id));
                setSelectedId(null);
              }}
            />
          ) : (
            <p className="rounded-lg bg-panel p-6 text-sm text-muted ring-1 ring-line">
              {requests.length ? 'Pick a request on the left to see its details.' : 'Details of each request will show here.'}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
