import path from 'node:path';

/**
 * UI automation primitives over the store's pages (Strategy + Adapter).
 *
 * Owns every DOM selector and heuristic: challenge detection, semantic
 * agreement checkboxes (only EULA/age gates, never marketing or email-sharing
 * opt-ins), extensible multi-locale order-button locators, and captcha-frame
 * detection.
 */

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

/** Best-effort diagnostic screenshot. */
export async function shot(page, errorsDir, name) {
  if (!errorsDir) return;
  try {
    await page.screenshot({ path: path.join(errorsDir, name), fullPage: true });
  } catch {
    // screenshots are diagnostics only
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
 * Click the order button. One combined locator waits once (no serial scan);
 * a click that fails once is retried once before giving up.
 * @returns {Promise<'clicked' | 'not-found' | 'click-failed'>}
 */
export async function clickOrderButton(page, optionsOrTimeout = 20_000) {
  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : (optionsOrTimeout ?? {});
  const timeoutMs = options.timeoutMs ?? 20_000;
  const selector = buildOrderButtonSelector(options.extraSelectors);

  for (const frame of page.frames()) {
    const locator = frame.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      continue; // this frame has no order button
    }
    try {
      await locator.click({ timeout: 8000 });
      return 'clicked';
    } catch {
      try {
        await locator.click({ timeout: 8000 });
        return 'clicked';
      } catch {
        return 'click-failed';
      }
    }
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
