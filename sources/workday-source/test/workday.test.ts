import {ccxUrl} from '../src/workday';

describe('ccxUrl', () => {
  it('should return the correct URL', () => {
    const postCxxPath = '/api/data';
    const baseUrl = 'https://example.com';

    const result = ccxUrl(postCxxPath, baseUrl);

    expect(result).toBe('https://example.com/ccx/api/data');
  });

  it('should return the correct URL with a trailing slash', () => {
    const postCxxPath = '/api/data';
    const baseUrl = 'https://example.com/';

    const result = ccxUrl(postCxxPath, baseUrl);

    expect(result).toBe('https://example.com/ccx/api/data');
  });
});
