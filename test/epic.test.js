import { describe, expect, it } from 'vitest';
import {
  decodeJwtPayload,
  elementsToFreeGames,
  epicSessionFromCookies,
  loginUrl,
  productUrl,
  purchaseUrl,
} from '../lib/epic.js';

const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload, header = { alg: 'RS256' }) => `${b64url(header)}.${b64url(payload)}.sig`;

describe('decodeJwtPayload', () => {
  it('decodes a standard JWT payload', () => {
    expect(decodeJwtPayload(jwt({ exp: 123, acct: 'abc' }))).toEqual({ exp: 123, acct: 'abc' });
  });

  it('returns null for malformed input', () => {
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.@@@.b')).toBeNull();
  });
});

describe('epicSessionFromCookies', () => {
  const cookie = (name, value, domain = '.epicgames.com') => ({ name, value, domain });

  it('accepts a valid EPIC_EG1 and reads the account identity', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = epicSessionFromCookies([cookie('EPIC_EG1', `v~${jwt({ exp, acct: 'acct-1', dn: 'player' })}~x`)]);
    expect(session.loggedIn).toBe(true);
    expect(session.accountId).toBe('acct-1');
    expect(session.displayName).toBe('player');
  });

  it('rejects an expired EPIC_EG1', () => {
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const session = epicSessionFromCookies([cookie('EPIC_EG1', `v~${jwt({ exp })}~x`)]);
    expect(session.loggedIn).toBe(false);
  });

  it('picks the valid EPIC_EG1 when an older expired EPIC_EG1 cookie is also present', () => {
    const expired = Math.floor(Date.now() / 1000) - 3600;
    const valid = Math.floor(Date.now() / 1000) + 3600;
    const session = epicSessionFromCookies([
      cookie('EPIC_EG1', `v~${jwt({ exp: expired, acct: 'stale' })}~x`, '.epicgames.com'),
      cookie('EPIC_EG1', `v~${jwt({ exp: valid, acct: 'fresh-id', dn: 'FreshName' })}~x`, 'store.epicgames.com'),
    ]);
    expect(session.loggedIn).toBe(true);
    expect(session.accountId).toBe('fresh-id');
    expect(session.displayName).toBe('FreshName');
  });

  it('falls back to durable account cookies when EG1 is absent', () => {
    for (const name of ['EPIC_SESSION_AP', 'EPIC_SSO_RM', 'EPIC_SSO']) {
      const session = epicSessionFromCookies([cookie(name, 'opaque-value')]);
      expect(session.loggedIn).toBe(true);
    }
  });

  it('ignores empty cookie values and other domains', () => {
    expect(epicSessionFromCookies([cookie('EPIC_SSO', '')]).loggedIn).toBe(false);
    expect(epicSessionFromCookies([{ name: 'EPIC_SSO', value: 'x', domain: 'other.com' }]).loggedIn).toBe(false);
    expect(epicSessionFromCookies([]).loggedIn).toBe(false);
  });
});

describe('elementsToFreeGames', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const active = discountPercentage => ({
    title: 'Game A',
    id: 'offer-1',
    namespace: 'ns-1',
    offerType: 'BASE_GAME',
    productSlug: 'game-a',
    keyImages: [
      { type: 'Thumbnail', url: 'https://cdn1.epicgames.com/t.jpg' },
      { type: 'OfferImageWide', url: 'https://cdn1.epicgames.com/w.jpg' },
    ],
    catalogNs: { mappings: [{ pageType: 'productHome', pageSlug: 'game-a-home' }] },
    promotions: {
      promotionalOffers: [{
        promotionalOffers: [{
          startDate: '2026-11-05T16:00:00.000Z',
          endDate: '2026-11-12T16:00:00.000Z',
          discountSetting: { discountPercentage },
        }],
      }],
    },
  });

  it('keeps only currently-active 100%-off offers', () => {
    const games = elementsToFreeGames(
      [active(0), active(20), { ...active(0), promotions: { promotionalOffers: [{
        promotionalOffers: [{ startDate: '2026-11-20T16:00:00.000Z', endDate: '2026-11-27T16:00:00.000Z', discountSetting: { discountPercentage: 0 } }],
      }] } }],
      'en-US',
      now,
    );
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      title: 'Game A',
      pageSlug: 'game-a-home',
      offerId: 'offer-1',
      namespace: 'ns-1',
      image: 'https://cdn1.epicgames.com/w.jpg',
      endsAt: '2026-11-12T16:00:00.000Z',
    });
  });

  it('builds a product URL and handles bundle slugs', () => {
    const games = elementsToFreeGames([active(0)], 'en-US', now);
    expect(games[0].url).toBe('https://store.epicgames.com/en-US/p/game-a-home');
    expect(productUrl('bundles/mystery')).toBe('https://store.epicgames.com/en-US/bundles/mystery');
  });
});

describe('urls', () => {
  it('loginUrl keeps lang optional and redirects to the store', () => {
    expect(loginUrl('en-US', 'zh-CN')).toBe(
      'https://www.epicgames.com/id/login?lang=zh-CN&redirectUrl=https%3A%2F%2Fstore.epicgames.com%2Fen-US%2F',
    );
    expect(loginUrl('en-US', null)).not.toContain('lang=');
  });

  it('purchaseUrl uses the namespace-offer form', () => {
    expect(purchaseUrl('ns', 'of')).toContain('offers=1-ns-of');
  });
});
