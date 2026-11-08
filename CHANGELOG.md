# Changelog

## 1.6.1 — 2026-11-08

Second-pass SOLID, GoF, and checkout-resilience audit:

- **Dynamic iframe polling in `clickOrderButton`**: Polls across live `page.frames()` in short slices instead of blocking on `frames()[0]` for 20s, immediately discovering late-mounted checkout iframes and re-running EULA checkbox checks.
- **Multi-cookie `EPIC_EG1` selection**: `epicSessionFromCookies` inspects all `EPIC_EG1` cookies across subdomains and picks the valid cookie with the latest expiration instead of stopping at an older expired cookie.
- **Observer pattern & superseded profile cleanup**: Added `state.subscribe()` on the domain model, automatic deletion of superseded `browser-profile-<key>` directories on duplicate-account consolidation, `0600` hardening + auto-pruning inside `shot()`, and corrupt-backup pruning (`.corrupt-*.bak` capped at 3).
- **4-surface operation symmetry**: Exposed `hide-sidebar` and `show-sidebar` across `lib/operations.js`, `/epicgames sidebar hide|show`, HTTP routes, and the `epicgames_free_games` agent tool; improved `lastError` reporting for per-game checkout failures.

## 1.6.0 — 2026-11-08

- **Hide in sidebar option (`hideSidebar`)**: Added an instant toggle switch inside **Settings → Epic free games** (and in **Settings → Plugins** config) to hide or show the left-sidebar shortcut icon (`default: false`). Hiding removes the `sidebar.panellist` icon immediately while keeping **Settings → Epic free games** always accessible.
- **Refined in-app descriptions**: Updated `locale/zh.json`, `locale/en.json`, and the page header introductions for multi-account clarity.

## 1.5.0 — 2026-11-08

SOLID & GoF architecture pass, multi-account login hardening, and autonomous
agent setup playbook (see `ARCHITECTURE-REVIEW.md` for the full audit).

### Fixed

- **Agent tool `logout` crash**: `index.js` now exposes the complete
  `epicGames` service facade via `lib/operations.js` (`Command` pattern) so
  `epicgames_free_games` with `action: "logout"` works alongside `status`,
  `login`, `check`, and `recheck`.
- **Multi-account login isolation & deduplication**:
  - `runLoginFlow` always wipes any leftover `browser-profile-login` scratch
    profile before opening the sign-in window, preventing stale cookies from an
    aborted sign-in from polluting or auto-completing the next account's login.
  - After SSO sign-in, the login flow visits the store and polls up to 15s for
    the `EPIC_EG1` cookie so `accountId` and `displayName` are reliably minted.
  - Re-signing into an already registered account (including accounts migrated
    under `legacy` or created before `EPIC_EG1` minted) reuses its existing
    profile key instead of creating a duplicate account entry.
  - Closing the login window on macOS (where closing the window closes the page
    while the background Chrome process stays alive) is detected immediately
    instead of waiting 10 minutes, and never clobbers `sessionOk` on existing
    signed-in accounts.
  - Failed profile adoption (`adoptProfile` returning `false`) now reports
    `adopt-failed` instead of a false-positive success (`adopted || true`).
- **Privacy & per-account claim scoping**:
  - `runClaimRun` refreshes account identity from cookies before recording
    claims, and `state.recentClaimedView()` masks raw account IDs so full
    32-character Epic IDs never leak in `/api/status` or UI tags.
  - `hasClaimed` scopes unminted accounts strictly to their own profile key so
    one account's claim never wildcard-blocks other accounts.
- **Offer resolution & checkout safety**:
  - `resolveOffer` now runs as a three-link Chain of Responsibility
    (`StorePageMapping` → localized CMS content → direct `candidate` offer
    identifiers) so a 404 on the legacy CMS no longer aborts resolution.
  - `queryOfferFree` enforces a 60-second safety margin before `expiryDate` so
    checkout never races the moment a free promotion reverts to paid price.
  - `shouldCheckAgreement` no longer false-positives on EULA labels containing
    the word `"offer"`, and explicitly blocks publisher email-sharing opt-ins;
    checkbox label lookup uses `HTMLInputElement.labels` and `CSS.escape`.
- **Security & resilience**:
  - `allowRequest` validates exact IPv4 loopback (`127.0.0.0/8`) instead of a
    `127.` prefix match that `127.evil.com` could bypass, and malformed percent
    encoding on `/api/logout/*` returns `400` instead of throwing `URIError`.
  - Added a retry circuit breaker (`scheduler.js`) that stops short-interval
    retries when sessions are expired (`auth`), API fingerprints are stale
    (`fingerprint`), or bot challenges fail 3 times in a row (`challenge`).

### Added

- `lib/state-store.js` (v4 Repository with corrupt-file `.bak` preservation and
  `createMemoryStore` test adapter), `lib/operations.js` (Command registry),
  `lib/storage.js` (directory hardening & legacy migrations), and
  `extraOrderSelectors` config option (plus built-in 10-language CTA selectors).
- Autonomous DeepSeek Harness installation & setup playbook in `README.md`
  (English & Chinese).

## 1.4.0 — 2026-11-08

Multi-account support; the project is renamed to
**`dsh-epicgames-autoclaim`** (from `dsh-plugin-epicgames-auto`), every
user-facing surface becomes language-switching bilingual, and the installation
documentation is corrected.

Localization:

- **Config field descriptions** now use schemastery's `i18n` locale maps
  (`{en, zh}`): the settings form renders them in the GUI's active language
  instead of a fixed English+Chinese concatenation.
- **`/epicgames` command replies switch by the user's language**: the Host
  reads the language chosen in Settings → General → Language (stored in the
  Host settings document) and replies in it; with no explicit choice the
  replies stay bilingual one-liners so they read for any user. (The command
  palette's description is a plain string by platform contract, so it keeps
  the short bilingual form.)
- The client page's zh/en dictionaries are audit-clean: key sets identical,
  duplicate legacy `session.expired` keys removed (the per-account variant
  wins), and every emitted activity code has a localized template.

Rename and install docs:

- **Rename.** Package name, plugin row id, client entry id, settings-section
  id, local HTTP route prefix (`/epicgames-autoclaim/api/*`), effect labels,
  and the repository URL all follow the new name. The data directory moves to
  `~/.dsh/data/epicgames-autoclaim/` from `~/.dsh/data/epicgames-auto/`
  (≤ v1.3.x; the unreleased interim build used `~/.dsh/data/epic-autoclaim/`)
  — migrated automatically on first start, so Epic sessions, claim history,
  and screenshots survive; no re-login needed.
- **Install docs corrected.** `plugin_manager install_bundle` is an assistant
  tool action, not a shell command (DeepSeek Harness has no CLI for plugin
  installs); the README now describes asking a DSH session to install a
  local checkout, and the plugin-market flow for after publication.
- Unchanged on purpose (domain names, not the project name): the `/epicgames`
  slash commands, the `epicgames_free_games` agent tool, and the `epicGames`
  service.

Multi-account:

- **Every registered Epic account claims its own library.** Each account has
  its own persistent browser profile; a check discovers the free games once,
  then claims account by account. Claim records stay per-account.
- **Add accounts by signing in**: the login window opens a scratch profile,
  so existing sessions are never disturbed; on success the profile is adopted
  under the account's key and the account joins the registry. Signing in as a
  known account refreshes it.
- **Sign out per account** — an Accounts card lists name, masked id, claim
  count, and session state with a Sign-out button (`/epicgames logout
  [name|all]`, tool action `logout`). Signing out destroys that profile's
  session cookies.
- Claim history rows and activity events now carry the account; the status
  document reports an `accounts` array (ids masked) under contract 3.
- **Upgrade-safe**: a pre-1.4 single-account install migrates its shared
  profile to a `legacy` account record, keeping the existing session.

## 1.3.0 — 2026-11-08

Page redesign (both the sidebar panel and the settings entry):

- **Layout**: header → status strip (state, account, actions, and a
  check-schedule meta row) → two-column grid (free this week · claim history)
  that reflows by container width → full-width activity log. The wide panel
  variant carries its own padding and a 1040px measure; the settings variant
  stays at 680px.
- **Game covers**: discovery now carries each game's wide key image (claim
  records store it too); rows render a 16:9 cover or a letter monogram when
  no image exists.
- **Craft pass**: CSS-drawn status dot, focus-visible rings on buttons and
  links, title-ellipsis with tooltip, proper empty states, 4pt spacing scale,
  section counts next to card titles.

## 1.2.1 — 2026-11-08

- Fixed the primary button's unreadable contrast: brand color no longer fills
  the button (white-on-brand broke in the active theme). The primary action
  now uses the theme-guaranteed pair — `label-primary` text on `bg-layer-2` —
  with the brand color as the border accent.

## 1.2.0 — 2026-11-08

- Added a **left-sidebar panel** (gift-box icon beside Plugins) opening the
  same page as the settings entry — the shell's layout service selects it,
  and the icon tints with the active state. The Settings → Epic free games
  entry remains.

## 1.1.1 — 2026-11-08

Privacy hardening for publication (see `PRIVACY.md` for the full data inventory).

- All plugin data directories are created `0700` and the state file `0600`
  (owner-only), self-healing documents written by earlier versions — the
  state names an account and its game library.
- Diagnostic screenshots now expire after 7 days (still capped at the newest
  20); they may show the account's display name, so they do not linger.
- Added `PRIVACY.md`: what is stored where, the complete network egress list,
  issue-filing guidance, and a one-line purge command.
- Added `.gitignore` for the repository.

## 1.1.0 — 2026-11-08

Architecture and reliability pass (see `ARCHITECTURE-REVIEW.md` for the full audit).

### Fixed

- **Ownership/API errors no longer masquerade as business conclusions.** A
  transient GraphQL failure used to skip a game as "not free"/"not purchasable"
  with no retry and no diagnostic; errors are now `error` outcomes that trigger
  the failure backoff and surface in the activity log.
- **`GET /api/status` requires the plugin header like every other route** — no
  other local process can read the status document (the account id is also
  masked in responses).
- **State file writes are atomic** (temp file + rename) and versioned
  (`schemaVersion`), so a crash can no longer tear `state.json` and a migration
  path exists for future formats.
- **Agreement checkboxes are ticked semantically**: only EULA/age-like boxes
  are checked, and marketing opt-ins are explicitly excluded.
- The browser `acquire` contract is honest: requesting different options now
  restarts the context instead of silently returning a mismatched one.
- Plugin unload awaits browser shutdown; diagnostic screenshots are pruned to
  the newest 20.

### Changed

- Restructured into focused modules (`epic-api`, `page-driver`, `browser`,
  `claim`, `controller`, `scheduler`, `http-api`, `command`); `index.js` is a
  composition root.
- Activity log entries are structured `{code, params}` and localized in the
  settings page (zh/en); `/epicgames` command replies are bilingual.
- Scheduling policy (interval / rotation+20min / failure backoff 1h→4h) is a
  pure, unit-tested function; phases derive in one place.
- `loginLang` now defaults to empty (follows `locale`); set it per profile for
  a fixed login-window language.
- Order-button search uses one combined locator instead of a serial scan.

### Added

- Vitest suite for the pure core: discovery projection, JWT/session parsing,
  account-scoped claim records, state migration/atomicity, scheduling policy,
  and the HTTP request guard.

## 1.0.0 — 2026-11-08

Initial release: one-time browser sign-in, scheduled discovery and $0 checkout
with captcha assist, settings page, `/epicgames` commands, agent tool entry,
rotation-aware scheduling, and per-account claim records.
