/**
 * Webhook signature checks for common providers. Uses Web Crypto, so it runs in the browser:
 * the secret you paste in the UI never leaves your machine.
 */

export type Provider = 'github' | 'meta' | 'stripe' | 'shopify' | 'slack' | 'custom';

export interface CustomScheme {
  header: string;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
  encoding: 'hex' | 'base64';
  /** Text before the signature in the header, e.g. "sha256=". */
  prefix?: string;
}

export interface SignatureResult {
  valid: boolean;
  /** Header that was read. */
  header: string;
  received: string | null;
  expected: string | null;
  /** Why it couldn't be checked, when it couldn't. */
  problem?: string;
}

export const PROVIDERS: Record<Exclude<Provider, 'custom'>, { label: string; header: string }> = {
  github: { label: 'GitHub', header: 'x-hub-signature-256' },
  meta: { label: 'Meta (WhatsApp, Facebook, Instagram)', header: 'x-hub-signature-256' },
  stripe: { label: 'Stripe', header: 'stripe-signature' },
  shopify: { label: 'Shopify', header: 'x-shopify-hmac-sha256' },
  slack: { label: 'Slack', header: 'x-slack-signature' },
};

export async function verifyWebhookSignature(
  provider: Provider,
  secret: string,
  headers: Array<[string, string]>,
  body: Uint8Array,
  custom?: CustomScheme,
): Promise<SignatureResult> {
  const get = (name: string) => headers.find(([h]) => h.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const text = new TextDecoder().decode(body);

  switch (provider) {
    case 'github':
    case 'meta': {
      const header = PROVIDERS[provider].header;
      const received = get(header);
      const expected = 'sha256=' + toHex(await hmac('SHA-256', secret, body));
      return result(header, received, expected, received?.toLowerCase() === expected);
    }

    case 'shopify': {
      const header = PROVIDERS.shopify.header;
      const received = get(header);
      const expected = toBase64(await hmac('SHA-256', secret, body));
      return result(header, received, expected, received === expected);
    }

    case 'stripe': {
      const header = PROVIDERS.stripe.header;
      const received = get(header);
      if (!received) return result(header, null, null, false, 'Header not present');
      const parts = received.split(',').map((p) => p.trim().split('=') as [string, string]);
      const timestamp = parts.find(([k]) => k === 't')?.[1];
      const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
      if (!timestamp || signatures.length === 0) return result(header, received, null, false, 'No t= or v1= in the header');
      const expected = toHex(await hmac('SHA-256', secret, encode(`${timestamp}.${text}`)));
      return result(header, received, `t=${timestamp},v1=${expected}`, signatures.includes(expected));
    }

    case 'slack': {
      const header = PROVIDERS.slack.header;
      const received = get(header);
      const timestamp = get('x-slack-request-timestamp');
      if (!timestamp) return result(header, received, null, false, 'x-slack-request-timestamp header not present');
      const expected = 'v0=' + toHex(await hmac('SHA-256', secret, encode(`v0:${timestamp}:${text}`)));
      return result(header, received, expected, received === expected);
    }

    case 'custom': {
      if (!custom?.header) return result('', null, null, false, 'Choose the header that carries the signature');
      const received = get(custom.header);
      const digest = await hmac(custom.algorithm, secret, body);
      const encoded = custom.encoding === 'hex' ? toHex(digest) : toBase64(digest);
      const expected = (custom.prefix ?? '') + encoded;
      const matches = custom.encoding === 'hex' ? received?.toLowerCase() === expected.toLowerCase() : received === expected;
      return result(custom.header, received, expected, Boolean(matches));
    }
  }
}

function result(header: string, received: string | null, expected: string | null, valid: boolean, problem?: string): SignatureResult {
  if (received === null && !problem) problem = 'Header not present';
  return { valid: valid && received !== null, header, received, expected, ...(problem ? { problem } : {}) };
}

async function hmac(algorithm: CustomScheme['algorithm'], secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encode(secret) as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data as BufferSource));
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
