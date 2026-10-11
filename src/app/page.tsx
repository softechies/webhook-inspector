import Link from 'next/link';
import { NewBinForm } from '@/components/NewBinForm';
import { timeAgo } from '@/lib/format';
import { publicOrigin } from '@/lib/origin';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const bins = getStore().listBins();
  const origin = await publicOrigin();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Catch a webhook</h1>
      <p className="mt-2 max-w-xl text-muted">
        Create a URL, paste it into Stripe, GitHub, WhatsApp or your own app, and every request it
        receives shows up here: headers, body and all. Replay any of them to your local server.
      </p>

      <div className="mt-6">
        <NewBinForm />
      </div>

      <section className="mt-12" aria-labelledby="urls">
        <h2 id="urls" className="text-lg font-semibold">Your URLs</h2>
        {bins.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet. Create one above and it will be listed here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg bg-panel ring-1 ring-line">
            {bins.map((bin) => (
              <li key={bin.id}>
                <Link href={`/b/${bin.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper">
                  <span className="font-medium">{bin.name}</span>
                  <span className="font-mono text-xs text-muted">{origin}/h/{bin.id}</span>
                  <span className="ml-auto text-sm text-muted">
                    {bin.requestCount === 0
                      ? 'No requests yet'
                      : `${bin.requestCount} request${bin.requestCount === 1 ? '' : 's'}, last ${timeAgo(bin.lastRequestAt!)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
