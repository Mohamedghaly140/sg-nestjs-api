import { resolveUniqueSlug } from './resolve-unique-slug';
import { slugify } from './slugify';

describe('slug utilities', () => {
  it('normalizes diacritics and punctuation into URL-safe slugs', () => {
    expect(slugify('  Robe Élite / Summer 2026!  ')).toBe(
      'robe-elite-summer-2026',
    );
  });

  it('returns the base slug when no collision exists', () => {
    expect(resolveUniqueSlug('dresses', ['separates'])).toBe('dresses');
  });

  it('uses -2 for the first collision', () => {
    expect(resolveUniqueSlug('dresses', ['dresses'])).toBe('dresses-2');
  });

  it('uses the highest numeric suffix plus one instead of filling gaps', () => {
    expect(
      resolveUniqueSlug('dresses', ['dresses', 'dresses-2', 'dresses-8']),
    ).toBe('dresses-9');
  });
});
