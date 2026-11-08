/**
 * Host-side user-language support.
 *
 * The GUI's active language is resolved client-side (explicit preference or
 * the browser's); the Host can only see it when the user picked a language
 * explicitly — Settings → General → Language stores that choice in the Host
 * settings document. `createUserLocale` reads the preference through the
 * settings service; when no explicit choice exists it returns `null` and
 * callers render bilingual text so every reply stays readable for any user.
 */

/**
 * The locale plugin's settings form is the only one whose single volatile
 * field is `preference`, so this shape identifies its namespace without
 * hard-coding an entry id that varies by composition.
 */
function localePreferenceRow(rows) {
  return rows.find(row => {
    const keys = Object.keys(row.schema?.dict ?? {});
    return keys.length === 1 && keys[0] === 'preference';
  });
}

/**
 * @param ctx plugin context (host half).
 * @returns () => the user's explicit locale id (e.g. `zh`, `en-US`), or
 *   `null` when the platform exposes no explicit choice.
 */
export function createUserLocale(ctx) {
  return () => {
    try {
      const settings = ctx.get('settings');
      if (typeof settings?.describe !== 'function') return null;
      const row = localePreferenceRow(settings.describe());
      const value = row?.value?.preference;
      return typeof value === 'string' && value !== '' ? value : null;
    } catch {
      return null;
    }
  };
}

/** Map a BCP 47-style id onto our two dictionaries; English is DSH's own fallback locale. */
export function languageOf(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Build a text picker for one command invocation.
 *
 * @param userLocale the value returned by the `createUserLocale` reader at
 *   call time (`null` when the user never picked a language).
 * @returns t(key, ...args) resolving a `{zh, en}` table entry — the value may
 *   be a string or a function of the args. With no explicit preference both
 *   languages are rendered (Chinese first, matching the historical replies).
 */
export function makeT(userLocale) {
  const language = userLocale === null ? null : languageOf(userLocale);
  return (table, key, ...args) => {
    const entry = table[key];
    if (!entry) return key;
    const render = value => (typeof value === 'function' ? value(...args) : value);
    if (language === null) return `${render(entry.zh)} ${render(entry.en)}`;
    return language === 'zh' ? render(entry.zh) : render(entry.en);
  };
}
