import { badRequest, notFound } from '@/lib/api';
import { replay } from '@/lib/replay';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Sends the captured request again to { url }. The request is made from the server running the inspector. */
export async function POST(request: Request, { params }: Context) {
  const captured = getStore().getRequest((await params).id);
  if (!captured) return notFound('Request not found');

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof body?.url !== 'string' || !body.url) return badRequest('url is required');

  return Response.json(await replay(captured, body.url));
}
