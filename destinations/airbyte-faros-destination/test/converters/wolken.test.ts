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

  describe('configuration_items', () => {
    test('configuration_items', async () => {
      configPath = await tempConfig({
        api_url: mockttp.url,
        log_records: true,
        source_specific_configs: {
          wolken: {
            service_id_flex_id: 1,
            jira_project_key_flex_id: 2,
            application_tag_flex_ids: [3],
            project_tag_flex_ids: [4],
            path_hierarchy_flex_ids: [1],
            application_mapping: {
              'A3F91B6D': {name: 'Test App'},
            },
          },
        },
      });
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/configuration_items.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });
});
