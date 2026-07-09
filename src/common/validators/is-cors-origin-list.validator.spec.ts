import { IsCorsOriginListConstraint } from './is-cors-origin-list.validator';

describe('IsCorsOriginListConstraint', () => {
  const validator = new IsCorsOriginListConstraint();

  it('accepts a single valid origin', () => {
    expect(validator.validate('https://app.example.com')).toBe(true);
  });

  it('accepts a comma-separated list with whitespace', () => {
    expect(
      validator.validate(
        'https://app.example.com, http://localhost:3000 ,https://admin.example.com',
      ),
    ).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validator.validate('')).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(validator.validate(undefined)).toBe(false);
  });

  it('rejects an entry with a path, query, or hash', () => {
    expect(validator.validate('https://app.example.com/callback')).toBe(false);
    expect(validator.validate('https://app.example.com?x=1')).toBe(false);
    expect(validator.validate('https://app.example.com#frag')).toBe(false);
  });

  it('rejects an entry with a non-http(s) protocol', () => {
    expect(validator.validate('ftp://app.example.com')).toBe(false);
  });

  it('rejects an unparseable entry', () => {
    expect(validator.validate('not-a-url')).toBe(false);
  });

  it('rejects if any entry in the list is invalid', () => {
    expect(validator.validate('https://app.example.com,not-a-url')).toBe(false);
  });
});
