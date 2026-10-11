import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(getStore().listBins());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.slice(0, 80) : '';
  return Response.json(getStore().createBin(name || 'Untitled'), { status: 201 });
}
