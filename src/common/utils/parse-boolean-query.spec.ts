import { parseBooleanQuery } from './parse-boolean-query';

describe('parseBooleanQuery', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
    [undefined, undefined],
    ['maybe', 'maybe'],
  ])('parses %p as %p from the raw query object', (raw, expected) => {
    expect(
      parseBooleanQuery({
        obj: { featured: raw },
        key: 'featured',
        value: !raw,
        type: 0,
      }),
    ).toBe(expected);
  });
});
