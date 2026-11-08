/**
 * Rendered-overflow harness: builds a worst-case DOM with the page's exact
 * CSS, renders it in a real Chromium at three surface widths, and asserts
 * that nothing overflows its box (scrollWidth/clientWidth) and nothing
 * crosses the page container's right edge. Run: node test/overflow.check.mjs
 */
import fs from 'node:fs';
import { chromium } from 'patchright';

const client = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cssMatch = client.match(/const CSS = `([\s\S]*?)`;/);
if (!cssMatch) throw new Error('CSS block not found in client.js');
const css = cssMatch[1];

const LONG_NAME = 'aVeryLongEpicDisplayName2026';
const LONG_TITLE = 'Some Particularly Long Windy Indie Game Name — Definitive Edition';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--dsw-alias-label-primary:#1a1a1a;--dsw-alias-label-secondary:#666;--dsw-alias-bg-layer-1:#fff;
        --dsw-alias-bg-layer-2:#eee;--dsw-alias-bg-overlay:#f6f6f6;--dsw-alias-border-l1:#e7e7e7;
        --dsw-alias-border-l2:#ddd;--dsw-alias-brand-primary:#4d6bfe;--dsw-alias-state-success-primary:#0a0;
        --dsw-alias-state-error-primary:#e00;--dsw-alias-state-warn-primary:#b60;--dsw-alias-state-idle-primary:#999}
  body{margin:0;font-family:sans-serif}
  ${css}
</style></head><body>
<div class="ega_page ega_wide" id="page">
  <header><h2 class="ega_title">Epic weekly free games</h2>
    <p class="ega_intro">Sign in to Epic once; the plugin then discovers and claims the weekly free games automatically — worst-case copy for measurement.</p></header>
  <div class="ega_card">
    <div class="ega_statusRow">
      <span class="ega_state"><span class="ega_dot ega_dotOk"></span>3 account(s) signed in</span>
      <span class="ega_actions">
        <button class="ega_button ega_primary">Add account / Sign in</button>
        <button class="ega_button">Check and claim now</button>
        <button class="ega_button">Re-verify library</button></span>
    </div>
    <div class="ega_accounts">
      <div class="ega_account"><span class="ega_dot ega_dotOk"></span>
        <div class="ega_accountMain"><span class="ega_accountName">${LONG_NAME}</span>
          <span class="ega_accountMeta">12345678… · 12 claimed</span></div>
        <button class="ega_button ega_buttonSm">Sign out</button></div>
      <div class="ega_account"><span class="ega_dot ega_dotBad"></span>
        <div class="ega_accountMain"><span class="ega_accountName">short</span>
          <span class="ega_accountMeta">87654321… · 3 claimed</span></div>
        <button class="ega_button ega_buttonSm">Sign out</button></div>
      <div class="ega_account"><span class="ega_dot ega_dotOk"></span>
        <div class="ega_accountMain"><span class="ega_accountName">middle-name-here</span>
          <span class="ega_accountMeta">abcdef12… · 0 claimed</span></div>
        <button class="ega_button ega_buttonSm">Sign out</button></div>
    </div>
    <div class="ega_meta"><span>Last check <span class="ega_metaValue">2026/11/8 19:40:12</span></span>
      <span class="ega_sep">·</span><span>Next check <span class="ega_metaValue">2026/11/9 07:40:12</span></span>
      <span class="ega_sep">·</span><span>Interval <span class="ega_metaValue">12h</span></span></div>
    <div class="ega_prefRow">
      <div class="ega_prefMain">
        <span class="ega_prefTitle">Hide icon in left sidebar</span>
        <span class="ega_prefHint">Hides the left-rail shortcut icon while keeping this page in Settings → Epic free games</span>
      </div>
      <button type="button" role="switch" aria-checked="true" class="ega_switch ega_switchOn">
        <span class="ega_switchThumb"></span>
      </button>
    </div>
    <p class="ega_warn">Human verification needed: solve it in the browser window; the plugin continues automatically — long warning line to stress wrapping behaviour.</p>
  </div>
  <div class="ega_grid">
    <div class="ega_card">
      <h3 class="ega_cardTitle">Free this week <span class="ega_count">2</span></h3>
      <ul class="ega_list">
        <li class="ega_game"><span class="ega_monogram">S</span>
          <div class="ega_gameBody"><a class="ega_gameTitle" href="#">${LONG_TITLE}</a>
            <span class="ega_gameMeta">until 2026/11/12 23:59:59</span></div></li>
        <li class="ega_game"><span class="ega_monogram">A</span>
          <div class="ega_gameBody"><a class="ega_gameTitle" href="#">Another Game Title Here</a>
            <span class="ega_gameMeta">until 2026/11/12 23:59:59</span></div></li>
      </ul>
    </div>
    <div class="ega_card">
      <h3 class="ega_cardTitle">Claim history <span class="ega_count">3</span></h3>
      <ul class="ega_list">
        <li class="ega_claim"><span class="ega_monogramSm">S</span>
          <div class="ega_claimBody"><span class="ega_gameTitle">${LONG_TITLE}</span>
            <span class="ega_claimTime">2026/11/8 19:31:11</span></div>
          <span class="ega_tags"><span class="ega_tag">${LONG_NAME}</span>
            <span class="ega_tag ega_tagClaimed">claimed</span></span></li>
        <li class="ega_claim"><span class="ega_monogramSm">A</span>
          <div class="ega_claimBody"><span class="ega_gameTitle">Another Game Title Here</span>
            <span class="ega_claimTime">2026/11/8 19:31:11</span></div>
          <span class="ega_tags"><span class="ega_tag">${LONG_NAME}</span>
            <span class="ega_tag ega_tagFailed">captcha-timeout-reason-long</span></span></li>
        <li class="ega_claim"><span class="ega_monogramSm">X</span>
          <div class="ega_claimBody"><span class="ega_gameTitle">Idle Champions of the Forgotten Realms</span>
            <span class="ega_claimTime">2026/11/8 19:31:11</span></div>
          <span class="ega_tags"><span class="ega_tag ega_tag">skipped</span></span></li>
      </ul>
    </div>
  </div>
  <div class="ega_card">
    <h3 class="ega_cardTitle">Activity</h3>
    <ul class="ega_log">
      <li><span class="ega_logTime">2026/11/8 19:31:11</span>Check (manual): 3 account(s), 2 free game(s) found, 1 claimed</li>
      <li><span class="ega_logTime">2026/11/8 19:30:02</span>Claim failed: ${LONG_TITLE} (${LONG_NAME}, captcha-timeout)</li>
    </ul>
  </div>
  <p class="ega_foot">Interval, country, and locale are configurable in Settings → Plugins.</p>
</div>
</body></html>`;

// both surfaces: the wide sidebar panel and the narrow settings column
const CASES = [
  { width: 380, wide: true },
  { width: 680, wide: true },
  { width: 1040, wide: true },
  { width: 380, wide: false },
  { width: 680, wide: false },
];

const browser = await chromium.launch({ headless: true });
let failures = 0;
for (const { width, wide } of CASES) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const markup = wide ? html : html.replace('ega_page ega_wide', 'ega_page');
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(markup)}`);
  const violations = await page.evaluate(() => {
    const out = [];
    const pageEl = document.getElementById('page');
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      out.push(`document horizontal scroll: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    }
    // Containment, not scrollWidth: ellipsized elements legitimately have
    // scrollWidth > clientWidth — what must never happen is any element's
    // box crossing the edge of its enclosing card (or the page container).
    for (const el of pageEl.querySelectorAll('*')) {
      const label = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`;
      const box = el.getBoundingClientRect();
      const container = el.closest('.ega_card') ?? pageEl;
      const bounds = container.getBoundingClientRect();
      if (box.right > bounds.right + 1) {
        out.push(`${label} crosses ${container === pageEl ? 'page' : 'card'} right edge by ${Math.round(box.right - bounds.right)}px`);
      }
      if (box.left < bounds.left - 1) {
        out.push(`${label} crosses ${container === pageEl ? 'page' : 'card'} left edge`);
      }
      // a flex column squeezed to nothing is as broken as an overflow
      if (el.classList.contains('ega_claimBody') && el.clientWidth === 0) {
        out.push(`${label} collapsed to zero width`);
      }
    }
    return out;
  });
  if (violations.length === 0) {
    console.log(`width ${width}${wide ? ' panel' : ' settings'}: clean ✓`);
  } else {
    failures += violations.length;
    console.log(`width ${width}${wide ? ' panel' : ' settings'}: ${violations.length} violation(s)`);
    for (const violation of violations) console.log('  ✗', violation);
  }
  await page.close();
}
await browser.close();
process.exit(failures === 0 ? 0 : 1);
