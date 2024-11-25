import {isEmail} from '../../src/converters/azure-repos/common';
import {generateBasicTestSuite} from './utils';

describe('common', () => {
  test('isEmail', () => {
    expect(isEmail('example@domain.com')).toBe(true);
    expect(isEmail('user.name+tag@sub.domain.co')).toBe(true); // true
    expect(isEmail('invalid-email')).toBe(false);
    expect(isEmail('@missinglocal.com')).toBe(false);
    expect(isEmail('user@.nodomain')).toBe(false);
  });
});

generateBasicTestSuite({sourceName: 'azure-repos'});
