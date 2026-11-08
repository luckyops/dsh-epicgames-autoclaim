# Changelog

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
