import path from 'node:path';

/**
 * UI automation primitives over the store's pages. This module owns every
 * selector: challenge detection, agreement checkboxes (semantic — only
 * EULA-like boxes, never marketing opt-ins), the order button (one combined
 * locator, no slow serial scans), and captcha-frame detection.
 */

const CHALLENGE_TITLES = /just a moment|attention required|verify you are human|please verify/i;
const CHALLENGE_MARKERS = '#challenge-running, #challenge-error-text, #challenge-form, [data-testid="talon-challenge"]';

/** Order-button selectors, combined into one locator (first visible wins). */
const ORDER_BUTTON_SELECTORS = [
  'button:has-text("Add to library")',
  'button:has-text("添加到媒体库")',
  'button:has-text("添加到库")',
  '[data-testid="purchase-cta-button"]',
  '.payment-confirm__order-btn',
  'button[data-component="PNPaymentConfirmOrderButton"]',
  'button:has-text("Place Order")',
  'button:has-text("Place order")',
  'button:has-text("立即下单")',
  'button:has-text("下订单")',
].join(', ');

/** A checkbox is an agreement gate only if its label looks like a EULA. */
const AGREEMENT_LABEL = /eula|end.user|agreement|terms|条件|条款|协议|同意|年龄|age|rating/i;
/** Never touch marketing opt-ins. */
const MARKETING_LABEL = /marketing|newsletter|subscribe|news|offer|订阅|新闻|优惠|资讯/i;

const CAPTCHA_FRAME = /hcaptcha|arkoselabs|funcaptcha|talon.*challenge/i;

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
  try {
    await page.screenshot({ path: path.join(errorsDir, name), fullPage: true });
  } catch {
    // screenshots are diagnostics only
  }
}

/**
 * Check EULA/age agreement checkboxes across frames — and only those. Each
 * visible checkbox's label (aria-label, aria-labelledby, or enclosing label)
 * must read like a license agreement and must not read like marketing, so an
 * opt-in checkbox on the checkout page is never ticked.
 */
export async function acceptAgreements(page) {
  for (const frame of page.frames()) {
    try {
      const decisions = await frame.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).slice(0, 12);
        const labelOf = box => {
          if (typeof box.getAttribute('aria-label') === 'string' && box.getAttribute('aria-label')) {
            return box.getAttribute('aria-label');
          }
          const labelledBy = box.getAttribute('aria-labelledby');
          if (labelledBy) {
            const text = labelledBy.split(/\s+/)
              .map(id => document.getElementById(id)?.textContent ?? '')
              .join(' ');
            if (text.trim()) return text;
          }
          const label = box.closest('label') ?? document.querySelector(`label[for="${box.id}"]`);
          return label?.textContent ?? '';
        };
        return boxes.map((box, index) => ({ index, label: labelOf(box) }));
      });

      for (const { index, label } of decisions) {
        if (!AGREEMENT_LABEL.test(label) || MARKETING_LABEL.test(label)) continue;
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
 * @returns {'clicked' | 'not-found' | 'click-failed'}
 */
export async function clickOrderButton(page, timeoutMs = 20_000) {
  for (const frame of page.frames()) {
    const locator = frame.locator(ORDER_BUTTON_SELECTORS).first();
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
