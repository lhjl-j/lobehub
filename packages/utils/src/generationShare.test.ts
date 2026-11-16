import { describe, expect, it } from 'vitest';

import { generationSharePath } from './generationShare';

describe('generationSharePath', () => {
  it('builds the public page path of a share', () => {
    expect(generationSharePath('Ab3xYz9Kq1Lm')).toBe('/share/g/Ab3xYz9Kq1Lm');
  });

  it('encodes characters that would leave the path segment', () => {
    expect(generationSharePath('a/b')).toBe('/share/g/a%2Fb');
  });
});
