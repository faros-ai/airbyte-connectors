import {getLocal} from 'mockttp';

import {
  CLI,
  initMockttp,
  readTestResourceFile,
  tempConfig,
  testLogger,
} from '../src';

describe('airbyte-testing-tools', () => {
  test('exports all required utilities', () => {
    expect(CLI).toBeDefined();
    expect(initMockttp).toBeDefined();
    expect(readTestResourceFile).toBeDefined();
    expect(tempConfig).toBeDefined();
    expect(testLogger).toBeDefined();
  });

  test('mockttp initialization', async () => {
    const mockttp = getLocal({debug: false, recordTraffic: false});
    await initMockttp(mockttp);
    expect(mockttp.url).toBeDefined();
    await mockttp.stop();
  });

  test('logger creation', () => {
    const logger = testLogger('test-logger');
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
  });
});
