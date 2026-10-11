import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '@/lib/signature';

// Expected values computed separately with Python's hmac module.
const secret = 'whsec_test';
const body = new TextEncoder().encode('{"id":"evt_1","type":"payment_intent.succeeded"}');
const HEX = '69150fef74289353b393f14e11b3e1e8ba2aff07041d1cefd700eab88c16383e';

describe('verifyWebhookSignature', () => {
  it('checks GitHub and Meta sha256= signatures', async () => {
    const headers: Array<[string, string]> = [['x-hub-signature-256', `sha256=${HEX}`]];
    expect((await verifyWebhookSignature('github', secret, headers, body)).valid).toBe(true);
    expect((await verifyWebhookSignature('meta', secret, headers, body)).valid).toBe(true);
    expect((await verifyWebhookSignature('github', 'wrong', headers, body)).valid).toBe(false);
  });

  it('checks Shopify base64 signatures', async () => {
    const headers: Array<[string, string]> = [['X-Shopify-Hmac-Sha256', 'aRUP73Qok1Ozk/FOEbPh6Loq/wcEHRzv1wDquIwWOD4=']];
    expect((await verifyWebhookSignature('shopify', secret, headers, body)).valid).toBe(true);
  });

  it('checks Stripe t=,v1= signatures and accepts any matching v1', async () => {
    const v1 = '001ce3ef73e456cedaab328328720d3ad59defb8bbd0f1518f46c04ad4ac0bb7';
    const headers: Array<[string, string]> = [['stripe-signature', `t=1700000000,v1=${'0'.repeat(64)},v1=${v1}`]];
    const result = await verifyWebhookSignature('stripe', secret, headers, body);
    expect(result.valid).toBe(true);
    expect(result.expected).toBe(`t=1700000000,v1=${v1}`);
  });

  it('explains a malformed Stripe header', async () => {
    const result = await verifyWebhookSignature('stripe', secret, [['stripe-signature', 'nonsense']], body);
    expect(result).toMatchObject({ valid: false, problem: 'No t= or v1= in the header' });
  });

  it('checks Slack v0 signatures', async () => {
    const headers: Array<[string, string]> = [
      ['x-slack-request-timestamp', '1700000000'],
      ['x-slack-signature', 'v0=ce344df073e98d52b32d595037ea221174c5315cea5aed44ccd05f02018360fb'],
    ];
    expect((await verifyWebhookSignature('slack', secret, headers, body)).valid).toBe(true);
  });

  it('supports a custom header, algorithm and encoding', async () => {
    const headers: Array<[string, string]> = [['x-signature', 'WFHWGaXcJEepqUZt9hW8shet234=']];
    const result = await verifyWebhookSignature('custom', secret, headers, body, {
      header: 'x-signature',
      algorithm: 'SHA-1',
      encoding: 'base64',
    });
    expect(result.valid).toBe(true);
  });

  it('says when the header is missing', async () => {
    const result = await verifyWebhookSignature('github', secret, [], body);
    expect(result).toMatchObject({ valid: false, received: null, problem: 'Header not present' });
  });
});
