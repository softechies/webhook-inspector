import { notFound } from '@/lib/api';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Newest first. ?after=<ISO time> returns only what arrived since, for polling. */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const store = getStore();
  if (!store.getBin(id)) return notFound('Bin not found');

  const after = new URL(request.url).searchParams.get('after') ?? undefined;
  return Response.json(store.listRequests(id, after ? { after } : {}));
}

export async function DELETE(_request: Request, { params }: Context) {
  const deleted = getStore().clearBin((await params).id);
  return Response.json({ deleted });
}
