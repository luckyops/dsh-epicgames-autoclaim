/**
 * UI automation primitives over the store's pages (Strategy + Adapter).
 *
 * Implements the Strategy Pattern to decouple locator heuristics (selectors,
 * agreement predicates, captcha detection) from the execution logic.
 */

import path from 'node:path';
import fs from 'node:fs';
import { pruneScreenshots } from './diagnostics.js';

const CHALLENGE_TITLES = /just a moment|attention required|verify you are human|please verify/i;
const CHALLENGE_MARKERS = '#challenge-running, #challenge-error-text, #challenge-form, [data-testid="talon-challenge"]';

/** Built-in order-button selectors (semantic attributes + localized CTA labels). */
export const DEFAULT_ORDER_BUTTON_SELECTORS = Object.freeze([
  '[data-testid="purchase-cta-button"]',
  '.payment-confirm__order-btn',
  'button[data-component="PNPaymentConfirmOrderButton"]',
  'button:has-text("Add to library")',
  'button:has-text("Place Order")',
  'button:has-text("Place order")',
  'button:has-text("添加到媒体库")',
  'button:has-text("添加到库")',
  'button:has-text("立即下单")',
  'button:has-text("下订单")',
  'button:has-text("新增至收藏庫")',
  'button:has-text("下訂單")',
  'button:has-text("ライブラリに追加")',
  'button:has-text("注文する")',
  'button:has-text("라이브러리에 추가")',
  'button:has-text("주문하기")',
  'button:has-text("Zur Bibliothek hinzufügen")',
  'button:has-text("Bestellung abschicken")',
  'button:has-text("Ajouter à la bibliothèque")',
  'button:has-text("Confirmer la commande")',
  'button:has-text("Añadir a la biblioteca")',
  'button:has-text("Realizar pedido")',
  'button:has-text("Adicionar à biblioteca")',
  'button:has-text("Fazer pedido")',
  'button:has-text("Добавить в библиотеку")',
  'button:has-text("Оформить заказ")',
]);

/** A checkbox is an agreement gate only if its label reads like a EULA/terms/age gate. */
const AGREEMENT_LABEL =
  /eula|end[\s-]*user|license\s+agreement|agreement|terms|privacy\s+policy|age|rating|mature|条件|条款|條款|协议|協議|同意|年龄|年齡|分级|分級/i;

/**
 * Never tick marketing, newsletter, promotional, or publisher email-sharing boxes.
 * Note: avoids bare `offer` because Epic's EULA text often says "...for this offer".
 */
const MARKETING_LABEL =
  /marketing|newsletter|subscribe|promotional|special\s+offers?|share\s+(?:my\s+|your\s+)?e-?mail|receive\s+(?:e-?mails?|updates|news)|communications?\s+from|订阅|訂閱|新闻|新聞|优惠|優惠|资讯|資訊|促销|促銷|共享.*邮|提供.*电子邮件|提供.*電子郵件|接收.*邮件|接收.*郵件/i;

const CAPTCHA_FRAME = /hcaptcha|arkoselabs|funcaptcha|talon.*challenge/i;

/** Pure Strategy predicate: should an agreement checkbox with `label` be checked? */
export function shouldCheckAgreement(label) {
  if (typeof label !== 'string') return false;
  const normalized = label.trim();
  if (!normalized) return false;
  return AGREEMENT_LABEL.test(normalized) && !MARKETING_LABEL.test(normalized);
}

/** Combine built-in and user-supplied CSS/Playwright selectors into one composite locator. */
export function buildOrderButtonSelector(extraSelectors = []) {
  const custom = Array.isArray(extraSelectors)
    ? extraSelectors.map(sel => String(sel).trim()).filter(Boolean)
    : [];
  return [...custom, ...DEFAULT_ORDER_BUTTON_SELECTORS].join(', ');
}

/** Detect an interstitial bot-check page (Cloudflare/Talon) by title and markers. */
export async function isChallengePage(page) {
  try {
    const title = await page.title();
    if (CHALLENGE_TITLES.test(title)) return true;
  } catch {
    // title unavailable — fall through to marker checks
  }
  try {
    const markers = await page.locator(CHALLENGE_MARKERS).count();
    return markers > 0;
  } catch {
    return false;
  }
}

/** Whether any frame currently hosts a captcha the user could solve. */
export function hasCaptchaFrame(page) {
  return page.frames().some(frame => CAPTCHA_FRAME.test(frame.url()));
}

/** Best-effort diagnostic screenshot with strict permission hardening and auto-pruning. */
export async function shot(page, errorsDir, name) {
  if (!errorsDir) return;
  const target = path.join(errorsDir, name);
  try {
    await page.screenshot({ path: target, fullPage: true });
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Best-effort permission hardening
    }
    pruneScreenshots(errorsDir);
  } catch {
    // screenshots are diagnostics only; ignore failures
  }
}

/**
 * Check EULA/age agreement checkboxes across frames — and only those.
 * Uses `HTMLInputElement.labels` and `CSS.escape(box.id)` so generated IDs
 * containing colons or quotes (e.g. React `:r1:`) never break `querySelector`.
 */
export async function acceptAgreements(page) {
  for (const frame of page.frames()) {
    try {
      const decisions = await frame.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).slice(0, 12);
        const labelOf = box => {
          const ariaLabel = box.getAttribute('aria-label');
          if (typeof ariaLabel === 'string' && ariaLabel.trim()) {
            return ariaLabel;
          }
          const labelledBy = box.getAttribute('aria-labelledby');
          if (labelledBy) {
            const text = labelledBy.split(/\s+/)
              .map(id => (id ? document.getElementById(id)?.textContent ?? '' : ''))
              .join(' ');
            if (text.trim()) return text;
          }
          if (box.labels && box.labels.length > 0) {
            const text = Array.from(box.labels).map(el => el.textContent ?? '').join(' ');
            if (text.trim()) return text;
          }
          const enclosing = box.closest('label');
          if (enclosing?.textContent?.trim()) return enclosing.textContent;
          if (box.id && typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            const explicit = document.querySelector(`label[for="${CSS.escape(box.id)}"]`);
            if (explicit?.textContent) return explicit.textContent;
          }
          return '';
        };
        return boxes.map((box, index) => ({
          index,
          checked: Boolean(box.checked),
          label: labelOf(box),
        }));
      });

      for (const { index, checked, label } of decisions) {
        if (checked || !shouldCheckAgreement(label)) continue;
        const checkbox = frame.locator('input[type="checkbox"]').nth(index);
        if (await checkbox.isVisible().catch(() => false)) {
          await checkbox.check({ timeout: 3000 }).catch(() => {});
        }
      }
    } catch {
      // agreements are optional per offer
    }
  }
}

/**
 * Click the order button by polling across live `page.frames()` up to `timeoutMs`.
 *
 * Re-reads `page.frames()` on each cycle so dynamically mounted checkout iframes
 * are discovered immediately instead of blocking on `frames()[0]` for the full
 * timeout. Also re-runs `acceptAgreements` when multiple frames are present so
 * late-mounted EULA checkboxes inside the purchase iframe are ticked.
 *
 * @returns {Promise<'clicked' | 'not-found' | 'click-failed'>}
 */
export async function clickOrderButton(page, optionsOrTimeout = 20_000) {
  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : (optionsOrTimeout ?? {});
  const timeoutMs = Math.max(200, options.timeoutMs ?? 20_000);
  const pollSliceMs = Math.min(450, timeoutMs);
  const selector = buildOrderButtonSelector(options.extraSelectors);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frames = typeof page.frames === 'function' ? page.frames() : [];
    for (const frame of frames) {
      const locator = frame.locator(selector).first();
      try {
        await locator.waitFor({
          state: 'visible',
          timeout: frames.length === 1 ? Math.min(1000, Math.max(100, deadline - Date.now())) : pollSliceMs,
        });
      } catch {
        continue;
      }

      try {
        await locator.click({ timeout: 8000 });
        return 'clicked';
      } catch {
        try {
          await acceptAgreements(page);
          await locator.click({ timeout: 8000 });
          return 'clicked';
        } catch {
          return 'click-failed';
        }
      }
    }
    if (Date.now() >= deadline) break;
    await acceptAgreements(page);
  }
  return 'not-found';
}

/** Build a PageDriver adapter bound to optional user-configured selectors (DIP port). */
export function createPageDriver({ extraOrderSelectors = [] } = {}) {
  return {
    isChallengePage,
    hasCaptchaFrame,
    shot,
    acceptAgreements,
    clickOrderButton: (page, timeoutMs = 20_000) =>
      clickOrderButton(page, { timeoutMs, extraSelectors: extraOrderSelectors }),
  };
}
