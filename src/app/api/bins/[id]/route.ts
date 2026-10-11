import { badRequest, notFound, parseBinResponse } from '@/lib/api';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const bin = getStore().getBin((await params).id);
  return bin ? Response.json(bin) : notFound('Bin not found');
}

/** Rename the bin or change what it answers. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; response?: unknown } | null;
  if (!body) return badRequest('Expected a JSON body');

  const changes: Parameters<ReturnType<typeof getStore>['updateBin']>[1] = {};
  if (typeof body.name === 'string') changes.name = body.name.slice(0, 80);
  if (body.response !== undefined) {
    const response = parseBinResponse(body.response);
    if (typeof response === 'string') return badRequest(response);
    changes.response = response;
  }

  const bin = getStore().updateBin(id, changes);
  return bin ? Response.json(bin) : notFound('Bin not found');
}

export async function DELETE(_request: Request, { params }: Context) {
  return getStore().deleteBin((await params).id) ? new Response(null, { status: 204 }) : notFound('Bin not found');
}
