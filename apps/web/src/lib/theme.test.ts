import { describe, expect, it } from 'vitest';

import { parseTheme, THEME_COOKIE, THEMES } from './theme';

describe('parseTheme', () => {
  it('reads the two known appearances', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });

  it('falls back to dark, which is the product’s default', () => {
    expect(parseTheme(undefined)).toBe('dark');
    expect(parseTheme(null)).toBe('dark');
    expect(parseTheme('')).toBe('dark');
  });

  it('ignores anything else in the cookie rather than trusting it', () => {
    expect(parseTheme('solarized')).toBe('dark');
    expect(parseTheme('LIGHT')).toBe('dark');
    expect(parseTheme('light ')).toBe('dark');
  });

  it('names the cookie once', () => {
    expect(THEME_COOKIE).toBe('quiz_theme');
  });

  it('lists exactly the appearances the parser accepts', () => {
    expect([...THEMES]).toEqual(['dark', 'light']);
    for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
  });
});
