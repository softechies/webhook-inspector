'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, inputClass } from './ui';

export function NewBinForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const response = await fetch('/api/bins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) {
          setError('Could not create the URL. Check that the server can write to its data folder.');
          setBusy(false);
          return;
        }
        const bin = (await response.json()) as { id: string };
        router.push(`/b/${bin.id}`);
      }}
    >
      <input
        className={`${inputClass} sm:max-w-xs`}
        placeholder="Name, e.g. Stripe test mode"
        aria-label="Name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create webhook URL'}
      </Button>
      {error && <p role="alert" className="text-sm text-delete">{error}</p>}
    </form>
  );
}
