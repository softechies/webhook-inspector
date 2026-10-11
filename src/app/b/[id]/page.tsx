import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Inspector } from '@/components/Inspector';
import { publicOrigin } from '@/lib/origin';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bin = getStore().getBin((await params).id);
  return { title: bin?.name ?? 'Not found' };
}

export default async function BinPage({ params }: Props) {
  const { id } = await params;
  const store = getStore();
  const bin = store.getBin(id);
  if (!bin) notFound();

  return <Inspector bin={bin} webhookUrl={`${await publicOrigin()}/h/${bin.id}`} initialRequests={store.listRequests(id)} />;
}
