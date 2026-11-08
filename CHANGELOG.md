# Changelog

## 1.4.0 — 2026-11-08

Multi-account support; the project is renamed to **`dsh-epic-autoclaim`**
(from `dsh-plugin-epicgames-auto`), every user-facing surface becomes
language-switching bilingual, and the installation documentation is
corrected.

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
  id, local HTTP route prefix (`/epic-autoclaim/api/*`), effect labels, and
  the repository URL all follow the new name. The data directory moves from
  `~/.dsh/data/epicgames-auto/` to `~/.dsh/data/epic-autoclaim/` — migrated
  automatically on first start, so Epic sessions, claim history, and
  screenshots survive; no re-login needed.
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
