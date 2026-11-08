import { describe, expect, it } from 'vitest';
import { languageOf, makeT } from '../lib/i18n.js';

const table = {
  plain: { zh: '已开始。', en: 'Started.' },
  fn: { zh: (n) => `已退出 ${n} 个账号。`, en: (n) => `Signed out ${n} account(s).` },
};

describe('languageOf', () => {
  it('maps BCP 47 ids onto the two dictionaries', () => {
    expect(languageOf('zh')).toBe('zh');
    expect(languageOf('zh-CN')).toBe('zh');
    expect(languageOf('en-US')).toBe('en');
    expect(languageOf('fr')).toBe('en'); // DSH's own fallback locale
    expect(languageOf(null)).toBe('en');
  });
});

describe('makeT', () => {
  it('picks the explicit language', () => {
    expect(makeT('zh')(table, 'plain')).toBe('已开始。');
    expect(makeT('en-US')(table, 'plain')).toBe('Started.');
  });

  it('renders function entries with arguments', () => {
    expect(makeT('zh')(table, 'fn', 3)).toBe('已退出 3 个账号。');
    expect(makeT('en')(table, 'fn', 3)).toBe('Signed out 3 account(s).');
  });

  it('falls back to bilingual text when no explicit preference exists', () => {
    expect(makeT(null)(table, 'plain')).toBe('已开始。 Started.');
    expect(makeT(null)(table, 'fn', 2)).toBe('已退出 2 个账号。 Signed out 2 account(s).');
  });

  it('passes unknown keys through', () => {
    expect(makeT('en')(table, 'missing')).toBe('missing');
  });
});
