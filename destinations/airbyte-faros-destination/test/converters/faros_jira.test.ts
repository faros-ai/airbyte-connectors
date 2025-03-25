import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {destinationWriteTest} from './utils';

describe('faros_jira', () => {
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

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_jira/catalog.json',
      inputRecordsPath: 'faros_jira/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('faros_issues', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_jira/catalog.json',
      inputRecordsPath: 'faros_jira/faros_issues.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('process records from all streams with qualifier', async () => {
    const boardsConfigPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });

    await destinationWriteTest({
      configPath: boardsConfigPath,
      catalogPath: 'test/resources/faros_jira/catalog.json',
      inputRecordsPath: 'faros_jira/with-source-qualifier.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('process records from all streams with use_projects_as_boards', async () => {
    const projectAsBoardsConfigPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });

    await destinationWriteTest({
      configPath: projectAsBoardsConfigPath,
      catalogPath: 'test/resources/faros_jira/catalog.json',
      inputRecordsPath: 'faros_jira/with-use-projects-as-boards.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('process faros_issues record with update additional fields', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_jira/catalog.json',
      inputRecordsPath: 'faros_jira/with_update_additional_fields.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
