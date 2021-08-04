import * as sut from '../src/index';

describe('index', () => {
  test('ok?', async () => {
    expect(sut.ok()).toEqual('OK');
  });
});
