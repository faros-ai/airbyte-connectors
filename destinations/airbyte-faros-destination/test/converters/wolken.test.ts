import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('wolken', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  describe('users', () => {
    test('users', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/users.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });

  describe('incidents', () => {
    test('incidents', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/incidents.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });
});
