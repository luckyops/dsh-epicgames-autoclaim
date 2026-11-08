/**
 * Epic Games Store endpoints and pure helpers.
 *
 * The discovery endpoint is a static CDN JSON API that works without a browser
 * session. Everything under GRAPHQL_ENDPOINT sits behind bot protection, so
 * those queries are executed with `fetch` inside a real logged-in browser page
 * (see lib/epic-api.js).
 */

export const EPIC_CLIENT_ID = '875a3b57d3a640a6b7f9b4e883463ab4';

export const FREE_GAMES_PROMOTIONS_ENDPOINT =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
export const GRAPHQL_ENDPOINT = 'https://store.epicgames.com/graphql';
export const STORE_CONTENT_ENDPOINT = 'https://store-content-ipv4.ak.epicgames.com/api/en-US/content';
export const PURCHASE_ENDPOINT = 'https://www.epicgames.com/store/purchase';
export const STORE_CART = 'https://store.epicgames.com/en-US/cart';
export const LOGIN_PAGE = 'https://www.epicgames.com/id/login';

/**
 * Persisted-query hashes used by the store front-end (catalog APQ). Epic
 * rotates these with storefront deployments; lib/epic-api.js detects the
 * `PersistedQueryNotFound` failure mode and reports it as a diagnostic
 * instead of silently skipping games.
 */
export const PERSISTED_HASHES = {
  mappingByPageSlug: '781fd69ec8116125fa8dc245c0838198cdf5283e31647d08dfa27f45ee8b1f30',
  catalogOffer: 'abafd6e0aa80535c43676f533f0283c7f5214a59e9fae6ebfb37bed1b1bb2e9b',
  offersValidation: '3c9bb0f213f6d0cb6bf056e6b206ba166c8dd59d014618e4d59bff11689f403a',
};

/**
 * The plain Epic sign-in page with a redirect back to the store home. No
 * OAuth `client_id`/`noHostRedirect` params: those render an interstitial
 * instead of the normal login form, and the web session cookie (EPIC_EG1)
 * this plugin needs is set by an ordinary web sign-in.
 *
 * @param locale store locale for the redirect target
 * @param lang explicit page language, or null to omit it (Epic then picks
 *   the visitor's own language)
 */
export function loginUrl(locale = 'en-US', lang = null) {
  const url = new URL(LOGIN_PAGE);
  if (lang) url.searchParams.set('lang', lang);
  url.searchParams.set('redirectUrl', `https://store.epicgames.com/${locale}/`);
  return url.toString();
}

export function purchaseUrl(namespace, offerId) {
  return `${PURCHASE_ENDPOINT}?highlightColor=0078f2&offers=1-${namespace}-${offerId}&orderId&purchaseToken&showNavigation=true`;
}

export function productUrl(pageSlug, locale = 'en-US') {
  return pageSlug.startsWith('bundles/')
    ? `https://store.epicgames.com/${locale}/${pageSlug}`
    : `https://store.epicgames.com/${locale}/p/${pageSlug}`;
}

export function decodeJwtPayload(token) {
  const part = String(token ?? '').split('.')[1];
  if (!part) return null;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Judge the Epic session from browser cookies. `EPIC_EG1` is the store's web
 * session JWT (carries `exp` plus the account identity); it is minted lazily
 * by visiting the store. The account-level cookies (`EPIC_SESSION_AP`,
 * `EPIC_SSO`, `EPIC_SSO_RM`) are the durable sign-in state a fresh login
 * leaves behind, so any of them counts as signed in — the claim run's store
 * visit mints EG1 on demand.
 */
export function epicSessionFromCookies(cookies) {
  const epic = (cookies ?? []).filter(
    cookie => String(cookie.domain ?? '').includes('epicgames.com'),
  );
  const has = name => epic.some(cookie => cookie.name === name && (cookie.value ?? '').length > 0);

  const eg1 = epic.find(cookie => cookie.name === 'EPIC_EG1');
  if (eg1) {
    const jwt = eg1.value.split('~')[1];
    if (jwt) {
      const payload = decodeJwtPayload(jwt);
      const expiresAt = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
      const accountId = typeof payload?.acct === 'string' ? payload.acct
        : typeof payload?.sub === 'string' ? payload.sub : null;
      const displayName = typeof payload?.dn === 'string' ? payload.dn
        : typeof payload?.displayName === 'string' ? payload.displayName : null;
      if (expiresAt === null || expiresAt > Date.now() + 30_000) {
        return { loggedIn: true, expiresAt, accountId, displayName };
      }
    }
  }
  if (has('EPIC_SESSION_AP') || has('EPIC_SSO_RM') || has('EPIC_SSO')) {
    return { loggedIn: true, expiresAt: null, accountId: null, displayName: null };
  }
  return { loggedIn: false, expiresAt: null, accountId: null, displayName: null };
}

/**
 * Discover the current "free now" games from the static promotions
 * endpoint. No browser and no login required.
 *
 * @returns {Promise<Array<{title: string, pageSlug: string, offerId: string|null,
 *   namespace: string|null, offerType: string|null, url: string, endsAt: string|null}>>}
 */
export async function discoverWeeklyFreeGames({ country = 'US', locale = 'en-US', signal } = {}) {
  const url = new URL(FREE_GAMES_PROMOTIONS_ENDPOINT);
  url.searchParams.set('locale', locale);
  url.searchParams.set('country', country);
  url.searchParams.set('allowCountries', country);

  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`freeGamesPromotions request failed: HTTP ${response.status}`);
  const body = await response.json();

  const elements = body?.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) throw new Error('freeGamesPromotions returned no catalog elements');

  return elementsToFreeGames(elements, locale, Date.now());
}

/** Pick the best wide cover image from a catalog element's key images. */
function coverImageOf(element) {
  const images = Array.isArray(element?.keyImages) ? element.keyImages : [];
  const preferred = images.find(image => image.type === 'DieselStoreFrontWide')
    ?? images.find(image => image.type === 'OfferImageWide')
    ?? images.find(image => image.type === 'Thumbnail');
  if (typeof preferred?.url !== 'string' || !preferred.url.startsWith('https://')) return null;
  return preferred.url;
}

/** Pure projection from catalog elements to "free now" candidates (tested). */
export function elementsToFreeGames(elements, locale = 'en-US', now = Date.now()) {
  const games = [];
  for (const element of elements ?? []) {
    let freeNow = false;
    let endsAt = null;
    for (const group of element?.promotions?.promotionalOffers ?? []) {
      for (const offer of group?.promotionalOffers ?? []) {
        const start = Date.parse(offer?.startDate ?? '');
        const end = Date.parse(offer?.endDate ?? '');
        if (
          Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end
          && offer?.discountSetting?.discountPercentage === 0
        ) {
          freeNow = true;
          endsAt = offer.endDate;
        }
      }
    }
    if (!freeNow) continue;

    const pageSlug = element?.catalogNs?.mappings?.find(mapping => mapping.pageType === 'productHome')
      ?.pageSlug ?? element?.productSlug ?? element?.urlSlug;
    if (!pageSlug) continue;

    games.push({
      title: element.title ?? pageSlug,
      pageSlug,
      offerId: element.id ?? null,
      namespace: element.namespace ?? null,
      offerType: element.offerType ?? null,
      image: coverImageOf(element),
      url: productUrl(pageSlug, locale),
      endsAt,
    });
  }
  return games;
}
