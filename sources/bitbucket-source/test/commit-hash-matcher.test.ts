import {CommitHashMatcher} from '../src/commit-hash-matcher';

describe('CommitHashMatcher', () => {
  let matcher: CommitHashMatcher;

  beforeEach(() => {
    const hashes = new Set([
      'abc123456789',
      'def987654321',
      'ghi246813579',
      'jkl135792468',
    ]);
    matcher = new CommitHashMatcher(hashes);
  });

  test('should match full hash', () => {
    expect(matcher.match('abc123456789')).toBe('abc123456789');
  });

  test('should match partial hash', () => {
    expect(matcher.match('def9876')).toBe('def987654321');
  });

  test('should return null for non-matching hash', () => {
    expect(matcher.match('xyz123')).toBeNull();
  });
});
