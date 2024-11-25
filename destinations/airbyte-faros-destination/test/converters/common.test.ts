import {Common} from '../../src/converters/common/common';

describe('common', () => {
  test('build computeApplication', async () => {
    expect(Common.computeApplication('SomeApp')).toStrictEqual({
      name: 'SomeApp',
      platform: '',
      uid: 'SomeApp',
    });
    expect(Common.computeApplication('SomeApp', undefined)).toStrictEqual({
      name: 'SomeApp',
      platform: '',
      uid: 'SomeApp',
    });
    expect(Common.computeApplication('SomeApp', null)).toStrictEqual({
      name: 'SomeApp',
      platform: '',
      uid: 'SomeApp',
    });
    expect(Common.computeApplication('SomeApp', '')).toStrictEqual({
      name: 'SomeApp',
      platform: '',
      uid: 'SomeApp',
    });
    expect(Common.computeApplication('SomeApp', 'SomePlatform')).toStrictEqual({
      name: 'SomeApp',
      platform: 'SomePlatform',
      uid: 'SomeApp_SomePlatform',
    });
  });

  test('isEmail', async () => {
    expect(Common.isEmail('example@domain.com')).toBe(true);
    expect(Common.isEmail('user.name+tag@sub.domain.co')).toBe(true); // true
    expect(Common.isEmail('invalid-email')).toBe(false);
    expect(Common.isEmail('@missinglocal.com')).toBe(false);
    expect(Common.isEmail('user@.nodomain')).toBe(false);
  });
});
