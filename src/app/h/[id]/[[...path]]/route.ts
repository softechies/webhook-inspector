import { captureRequest, respond, DEFAULT_MAX_BODY_BYTES } from '@/lib/capture';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; path?: string[] }> };

/** Receives webhooks on /h/{bin} and /h/{bin}/any/path, for every HTTP method. */
async function handle(request: Request, { params }: Context): Promise<Response> {
  const { id, path } = await params;
  const store = getStore();
  const bin = store.getBin(id);
  if (!bin) {
    return Response.json({ error: 'No bin with this id. Create one in the inspector first.' }, { status: 404 });
  }

  const maxBody = Number(process.env.MAX_BODY_BYTES ?? DEFAULT_MAX_BODY_BYTES);
  const captured = await captureRequest(request, id, path?.length ? `/${path.join('/')}` : '/', maxBody);
  store.addRequest(captured);
  return respond(bin.response);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
