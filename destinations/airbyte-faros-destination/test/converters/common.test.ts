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
});
