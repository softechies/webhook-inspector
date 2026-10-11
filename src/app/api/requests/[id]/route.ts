import { notFound, toDetail } from '@/lib/api';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const request = getStore().getRequest((await params).id);
  return request ? Response.json(toDetail(request)) : notFound('Request not found');
}

export async function DELETE(_request: Request, { params }: Context) {
  return getStore().deleteRequest((await params).id) ? new Response(null, { status: 204 }) : notFound('Request not found');
}
