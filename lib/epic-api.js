/**
 * Epic store data access, executed inside the logged-in browser page (the
 * requests ride its cookies and fingerprint). Results are discriminated
 * unions: transport trouble, bot walls, and stale persisted-query hashes are
 * `error` outcomes, never silently folded into a business conclusion.
 *
 * Offer resolution uses a Chain of Responsibility (`mappingByPageSlug` →
 * `storeContentUrl` → direct `candidate` identifiers) so a failure or 404 in
 * an earlier lookup degrades gracefully to the next strategy instead of
 * aborting the claim.
 */
import {
  GRAPHQL_ENDPOINT,
  PERSISTED_HASHES,
  storeContentUrl,
} from './epic.js';

/** Safety buffer before promotion expiry so checkout never races a price revert. */
export const EXPIRY_SAFETY_BUFFER_MS = 60_000;

export function sleep(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export class EpicApiError extends Error {
  constructor(message, { fingerprintStale = false, status = 0 } = {}) {
    super(message);
    this.name = 'EpicApiError';
    this.fingerprintStale = fingerprintStale;
    this.status = status;
  }
}

/** JSON fetch inside the page. Throws `EpicApiError` on non-200 or invalid JSON. */
export async function pageFetchJson(page, url, params) {
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
    throw new EpicApiError(
      `Epic request failed (HTTP ${result.status}) for ${target}`,
      { status: result.status },
    );
  }
  return result.json;
}

/** Run one persisted GraphQL query, surfacing stale-hash rotation loudly. */
export async function gql(page, operationName, variables, sha256Hash) {
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
 * Resolve the purchasable weekly offer behind a catalog candidate using a
 * three-link Chain of Responsibility:
 * 1. `StorePageMapping` GraphQL query
 * 2. Store CMS content endpoint (`/api/<locale>/content/...`)
 * 3. Direct `offerId` + `namespace` on the promotions catalog element itself
 *
 * A failure in link 1 or link 2 falls through to the next link so a 404 on
 * the legacy CMS or a rotated mapping hash never blocks a candidate that
 * already carries valid `offerId` and `namespace`.
 *
 * @returns {Promise<{offerId: string, namespace: string} | null>}
 */
export async function resolveOffer(page, candidate, config = {}, { onFingerprintStale } = {}) {
  let resolvedSlug = candidate.pageSlug;
  let firstError = null;

  // Link 1: StorePageMapping GraphQL
  if (candidate.pageSlug) {
    try {
      const mapping = await gql(
        page,
        'getMappingByPageSlug',
        { pageSlug: candidate.pageSlug, locale: config.locale || 'en-US' },
        PERSISTED_HASHES.mappingByPageSlug,
      );
      const mapped = mapping?.data?.StorePageMapping?.mapping;
      if (mapped?.mappings?.offer?.id && mapped.mappings.offer.namespace) {
        return { offerId: mapped.mappings.offer.id, namespace: mapped.mappings.offer.namespace };
      }
      if (typeof mapped?.pageSlug === 'string' && mapped.pageSlug) {
        resolvedSlug = mapped.pageSlug;
      }
    } catch (error) {
      if (error instanceof EpicApiError && error.fingerprintStale) {
        onFingerprintStale?.(true);
      }
      firstError = firstError ?? error;
    }
  }

  // Link 2: Store CMS content API
  if (resolvedSlug) {
    try {
      const itemPath = candidate.offerType === 'BUNDLE' ? 'bundles' : 'products';
      const json = await pageFetchJson(
        page,
        storeContentUrl(itemPath, resolvedSlug, config.locale || 'en-US'),
      );
      const offers = candidate.offerType === 'BUNDLE'
        ? [json?.offer].filter(Boolean)
        : (json?.pages ?? []).map(entry => entry?.offer).filter(Boolean);
      const live = offers.filter(offer => offer?.hasOffer && offer?.id && offer?.namespace);
      if (live.length > 0) {
        return { offerId: live[0].id, namespace: live[0].namespace };
      }
    } catch (error) {
      firstError = firstError ?? error;
    }
  }

  // Link 3: Direct offer identifiers from freeGamesPromotions
  if (candidate.offerId && candidate.namespace) {
    return { offerId: candidate.offerId, namespace: candidate.namespace };
  }

  // If no link resolved an offer and an upstream transport/API error occurred,
  // rethrow so the caller records an `error` outcome (with retry) rather than `skipped`.
  if (firstError) throw firstError;
  return null;
}

/**
 * Ask Epic's entitlement API whether the signed-in account owns the offer.
 * @returns {Promise<{kind:'ok', owned: boolean, blocked: boolean} |
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
 * Verify through the catalog that the offer is really free right now, with a
 * 60-second safety margin before `expiryDate` so checkout never races the
 * moment a free promotion reverts to paid price.
 * @returns {Promise<{kind:'ok', free: boolean} |
 *   {kind:'error', message: string, fingerprintStale?: boolean}>}
 */
export async function queryOfferFree(page, offer, config, now = Date.now()) {
  try {
    const json = await gql(
      page,
      'getCatalogOffer',
      {
        locale: config.locale || 'en-US',
        country: config.country || 'US',
        offerId: offer.offerId,
        sandboxId: offer.namespace,
      },
      PERSISTED_HASHES.catalogOffer,
    );
    const catalogOffer = json?.data?.Catalog?.catalogOffer;
    if (!catalogOffer) {
      return { kind: 'error', message: 'catalog offer returned no data' };
    }
    const free = catalogOffer?.price?.totalPrice?.discountPrice === 0;
    const expiryMs = catalogOffer.expiryDate ? Date.parse(catalogOffer.expiryDate) : Number.NaN;
    const expired = Number.isFinite(expiryMs) ? expiryMs <= now + EXPIRY_SAFETY_BUFFER_MS : false;
    return { kind: 'ok', free: free && !expired };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
      fingerprintStale: error instanceof EpicApiError && error.fingerprintStale,
    };
  }
}
