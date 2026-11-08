/**
 * Epic store data access, executed inside the logged-in browser page (the
 * requests ride its cookies and fingerprint). Results are discriminated
 * unions: transport trouble, bot walls, and stale persisted-query hashes are
 * `error` outcomes, never silently folded into a business conclusion.
 */
import {
  GRAPHQL_ENDPOINT,
  PERSISTED_HASHES,
  STORE_CONTENT_ENDPOINT,
} from './epic.js';

const sleep = ms => new Promise(resolve => {
  setTimeout(resolve, ms);
});

export class EpicApiError extends Error {
  constructor(message, { fingerprintStale = false } = {}) {
    super(message);
    this.name = 'EpicApiError';
    this.fingerprintStale = fingerprintStale;
  }
}

/** JSON fetch inside the page. Returns `{ ok, status, json }`; ok=false is an error. */
async function pageFetchJson(page, url, params) {
  const target = params ? `${url}?${new URLSearchParams(params)}` : url;
  const result = await page.evaluate(async requestUrl => {
    try {
      const response = await fetch(requestUrl, { credentials: 'include' });
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { status: response.status, json };
    } catch (error) {
      return { status: 0, json: null, error: String(error) };
    }
  }, target);

  if (result.status !== 200 || result.json === null) {
    throw new EpicApiError(`Epic request failed (HTTP ${result.status}) for ${target}`);
  }
  return result.json;
}

/** Run one persisted GraphQL query, surfacing stale-hash rotation loudly. */
async function gql(page, operationName, variables, sha256Hash) {
  const json = await pageFetchJson(page, GRAPHQL_ENDPOINT, {
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash } }),
  });
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    const first = json.errors[0]?.message ?? 'unknown GraphQL error';
    const stale = /PersistedQueryNotSupported|PersistedQueryNotFound/i.test(
      `${first} ${json.errors[0]?.extensions?.code ?? ''}`,
    );
    throw new EpicApiError(`Epic GraphQL ${operationName}: ${first}`, { fingerprintStale: stale });
  }
  return json;
}

/**
 * Resolve the purchasable weekly offer behind a catalog candidate:
 * StorePageMapping first, the CMS content API second, the promotions
 * element itself last (it is usually already the weekly offer).
 * @returns {{offerId: string, namespace: string} | null}
 */
export async function resolveOffer(page, candidate, config) {
  const mapping = await gql(
    page,
    'getMappingByPageSlug',
    { pageSlug: candidate.pageSlug, locale: config.locale },
    PERSISTED_HASHES.mappingByPageSlug,
  );
  const mapped = mapping?.data?.StorePageMapping?.mapping;
  if (mapped?.mappings?.offer?.id && mapped.mappings.offer.namespace) {
    return { offerId: mapped.mappings.offer.id, namespace: mapped.mappings.offer.namespace };
  }

  const resolvedSlug = typeof mapped?.pageSlug === 'string' && mapped.pageSlug
    ? mapped.pageSlug
    : candidate.pageSlug;
  if (resolvedSlug) {
    const itemPath = candidate.offerType === 'BUNDLE' ? 'bundles' : 'products';
    const json = await pageFetchJson(page, `${STORE_CONTENT_ENDPOINT}/${itemPath}/${resolvedSlug}`);
    const offers = candidate.offerType === 'BUNDLE'
      ? [json?.offer].filter(Boolean)
      : (json?.pages ?? []).map(entry => entry?.offer).filter(Boolean);
    const live = offers.filter(offer => offer?.hasOffer && offer?.id && offer?.namespace);
    if (live.length > 0) {
      return { offerId: live[0].id, namespace: live[0].namespace };
    }
  }

  if (candidate.offerId && candidate.namespace) {
    return { offerId: candidate.offerId, namespace: candidate.namespace };
  }
  return null;
}

/**
 * Ask Epic's entitlement API whether the signed-in account owns the offer.
 * @returns {Promise<{kind:'ok', owned: boolean, blocked: boolean}> |
 *   {kind:'error', message: string, fingerprintStale?: boolean}>}
 */
export async function queryOwnership(page, offer) {
  try {
    const json = await gql(
      page,
      'getOffersValidation',
      { offers: [{ offerId: offer.offerId, namespace: offer.namespace }] },
      PERSISTED_HASHES.offersValidation,
    );
    const validation = json?.data?.Entitlements?.cartOffersValidation;
    if (!validation) {
      return { kind: 'error', message: 'offers validation returned no data' };
    }
    const owned = (validation.fullyOwnedOffers ?? []).length > 0;
    const blocked = (validation.missingPrerequisites ?? []).length > 0
      || (validation.conflictingOffers ?? []).length > 0
      || (validation.unablePartiallyUpgradeOffers ?? []).length > 0;
    return { kind: 'ok', owned, blocked };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
      fingerprintStale: error instanceof EpicApiError && error.fingerprintStale,
    };
  }
}

/**
 * Verify through the catalog that the offer is really free right now.
 * @returns {Promise<{kind:'ok', free: boolean} |
 *   {kind:'error', message: string, fingerprintStale?: boolean}>}
 */
export async function queryOfferFree(page, offer, config) {
  try {
    const json = await gql(
      page,
      'getCatalogOffer',
      { locale: config.locale, country: config.country, offerId: offer.offerId, sandboxId: offer.namespace },
      PERSISTED_HASHES.catalogOffer,
    );
    const catalogOffer = json?.data?.Catalog?.catalogOffer;
    if (!catalogOffer) {
      return { kind: 'error', message: 'catalog offer returned no data' };
    }
    const free = catalogOffer?.price?.totalPrice?.discountPrice === 0;
    const expired = catalogOffer.expiryDate ? Date.parse(catalogOffer.expiryDate) < Date.now() : false;
    return { kind: 'ok', free: free && !expired };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
      fingerprintStale: error instanceof EpicApiError && error.fingerprintStale,
    };
  }
}

export { sleep };
