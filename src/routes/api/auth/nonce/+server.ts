import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminClient } from '$lib/db/supabaseAdmin';

const schema = z.object({
  address: z.string().min(1),
  chain: z.enum(['base','voi','solana']),
});

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid payload' }, { status: 400 });

  const { address, chain } = parsed.data;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  const payload = {
    nonce: crypto.randomUUID(),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    statement: 'Sign this one-time nonce to authenticate.',
    domain: request.headers.get('host') ?? undefined,
  };

  const supabase = createAdminClient();
  await supabase.from('nonces').upsert({
    address, chain, nonce: payload.nonce, expires_at: expiresAt.toISOString(),
  }, { onConflict: 'chain,address' });

  return json(payload);
};
