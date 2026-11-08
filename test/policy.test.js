import { describe, expect, it } from 'vitest';
import { derivePhase, isCircuitOpen, nextRunAt } from '../lib/scheduler.js';
import { allowRequest } from '../lib/http-api.js';
import { buildOrderButtonSelector, clickOrderButton, shouldCheckAgreement } from '../lib/page-driver.js';
import { queryOfferFree, resolveOffer } from '../lib/epic-api.js';

describe('nextRunAt & circuit breaker', () => {
  const hour = 3_600_000;
  const now = 1_000_000;

  it('schedules the plain interval', () => {
    expect(nextRunAt({ now, intervalHours: 12 })).toBe(now + 12 * hour);
  });

  it('checks shortly after the next rotation, whichever is earlier, ignoring past rotations', () => {
    const rotationAt = now + 2 * hour;
    expect(nextRunAt({ now, intervalHours: 12, rotationAt })).toBe(rotationAt + 20 * 60_000);
    const lateRotation = now + 48 * hour;
    expect(nextRunAt({ now, intervalHours: 12, rotationAt: lateRotation })).toBe(now + 12 * hour);
    const pastRotation = now - 30 * 60_000;
    expect(nextRunAt({ now, intervalHours: 12, rotationAt: pastRotation })).toBe(now + 12 * hour);
  });

  it('backs off transient failures 1h doubling to a 4h cap and resets on success', () => {
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 1 })).toBe(now + hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 2 })).toBe(now + 2 * hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 5 })).toBe(now + 4 * hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 0 })).toBe(now + 12 * hour);
  });

  it('opens circuit breaker for auth, fingerprint, and >=3 consecutive challenge failures', () => {
    expect(isCircuitOpen({ consecutiveFailures: 1, failureKind: 'auth' })).toBe(true);
    expect(isCircuitOpen({ consecutiveFailures: 1, failureKind: 'fingerprint' })).toBe(true);
    expect(isCircuitOpen({ consecutiveFailures: 2, failureKind: 'challenge' })).toBe(false);
    expect(isCircuitOpen({ consecutiveFailures: 3, failureKind: 'challenge' })).toBe(true);
    expect(
      nextRunAt({ now, intervalHours: 12, consecutiveFailures: 3, failureKind: 'challenge' }),
    ).toBe(now + 12 * hour);
  });
});

describe('derivePhase', () => {
  it('prefers the running operation, then multi-account session state, then the stored phase', () => {
    expect(derivePhase({ kind: 'login' }, { sessionOk: true, phase: 'claiming' })).toBe('login-waiting');
    expect(derivePhase({ kind: 'check', phase: 'claiming' }, { sessionOk: true, phase: 'idle' })).toBe('claiming');
    expect(derivePhase(null, { sessionOk: false, phase: 'idle' })).toBe('need-login');
    expect(derivePhase(null, { sessionOk: true, phase: 'claiming' })).toBe('claiming');
    expect(derivePhase(null, { sessionOk: null, phase: 'idle' })).toBe('idle');
    // Multi-account: if at least one account is valid, do not report need-login
    expect(
      derivePhase(null, {
        sessionOk: false,
        phase: 'idle',
        accounts: {
          a: { key: 'a', sessionOk: false },
          b: { key: 'b', sessionOk: true },
        },
      }),
    ).toBe('idle');
  });
});

describe('allowRequest', () => {
  const ok = { 'x-ega-plugin': '1', host: '127.0.0.1:49320' };

  it('requires the plugin header and a loopback host', () => {
    expect(allowRequest(ok)).toBe(true);
    expect(allowRequest({ host: '127.0.0.1:49320' })).toBe(false);
    expect(allowRequest({ 'x-ega-plugin': '1', host: 'example.com' })).toBe(false);
    expect(allowRequest({ 'x-ega-plugin': '1' })).toBe(false);
  });

  it('accepts localhost and ::1, rejects foreign origins and 127.evil.com domains (CSRF / DNS rebinding)', () => {
    expect(allowRequest({ ...ok, host: 'localhost:49320' })).toBe(true);
    expect(allowRequest({ ...ok, host: '[::1]:49320' })).toBe(true);
    expect(allowRequest({ ...ok, origin: 'http://evil.example' })).toBe(false);
    expect(allowRequest({ ...ok, origin: 'http://127.evil.com' })).toBe(false);
    expect(allowRequest({ 'x-ega-plugin': '1', host: '127.evil.com:49320' })).toBe(false);
    expect(allowRequest({ ...ok, origin: 'http://127.0.0.1:49320' })).toBe(true);
  });
});

describe('shouldCheckAgreement & buildOrderButtonSelector', () => {
  it('checks EULA/terms/age agreements (even when mentioning "this offer") and skips marketing/email opt-ins', () => {
    expect(shouldCheckAgreement('I have read and agree to the End User License Agreement for this offer.')).toBe(true);
    expect(shouldCheckAgreement('我已阅读并同意最终用户许可协议与年龄分级条款')).toBe(true);
    expect(shouldCheckAgreement('I agree to share my email with the publisher for marketing updates')).toBe(false);
    expect(shouldCheckAgreement('Subscribe to newsletter and special offers')).toBe(false);
    expect(shouldCheckAgreement('同意向发行商提供我的电子邮件以接收优惠资讯')).toBe(false);
  });

  it('prepends extraOrderSelectors before built-in selectors', () => {
    const combined = buildOrderButtonSelector(['#custom-cta']);
    expect(combined.startsWith('#custom-cta, ')).toBe(true);
  });

  it('discovers and clicks an order button inside a dynamically mounted second iframe without blocking on frame[0]', async () => {
    let calls = 0;
    const outerFrame = {
      evaluate: async () => [],
      locator: () => ({
        first: () => ({
          waitFor: async () => {
            throw new Error('timeout on outer frame');
          },
        }),
      }),
    };
    let clicked = false;
    const checkoutIframe = {
      evaluate: async () => [],
      locator: () => ({
        first: () => ({
          waitFor: async () => {},
          click: async () => {
            clicked = true;
          },
        }),
      }),
    };
    const page = {
      frames: () => {
        calls += 1;
        // First cycle only has outerFrame; second cycle attaches checkoutIframe
        return calls < 2 ? [outerFrame] : [outerFrame, checkoutIframe];
      },
    };
    const result = await clickOrderButton(page, 2000);
    expect(result).toBe('clicked');
    expect(clicked).toBe(true);
  });
});

describe('epic-api Chain of Responsibility & expiry safety buffer', () => {
  it('falls back to candidate offerId/namespace when StorePageMapping and CMS return 404', async () => {
    const fakePage = {
      evaluate: async () => ({ status: 404, json: null }),
    };
    const resolved = await resolveOffer(
      fakePage,
      { pageSlug: 'modern-game', offerId: 'direct-offer', namespace: 'direct-ns' },
      { locale: 'en-US' },
    );
    expect(resolved).toEqual({ offerId: 'direct-offer', namespace: 'direct-ns' });
  });

  it('rejects offers expiring within the 60-second safety margin', async () => {
    const now = 1_000_000_000_000;
    const fakePage = expiryMs => ({
      evaluate: async () => ({
        status: 200,
        json: {
          data: {
            Catalog: {
              catalogOffer: {
                price: { totalPrice: { discountPrice: 0 } },
                expiryDate: new Date(expiryMs).toISOString(),
              },
            },
          },
        },
      }),
    });

    const tooClose = await queryOfferFree(
      fakePage(now + 30_000),
      { offerId: 'o1', namespace: 'ns1' },
      { locale: 'en-US', country: 'US' },
      now,
    );
    expect(tooClose).toEqual({ kind: 'ok', free: false });

    const safe = await queryOfferFree(
      fakePage(now + 120_000),
      { offerId: 'o1', namespace: 'ns1' },
      { locale: 'en-US', country: 'US' },
      now,
    );
    expect(safe).toEqual({ kind: 'ok', free: true });
  });
});
