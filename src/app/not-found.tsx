import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">This URL doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">It may have been deleted. Create a new one to start capturing again.</p>
      <Link href="/" className="mt-6 inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
        Back to your URLs
      </Link>
    </main>
  );
}
