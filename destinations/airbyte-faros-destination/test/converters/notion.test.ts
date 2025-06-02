import {
  initMockttp,
  sourceSpecificTempConfig,
} from 'faros-airbyte-testing-tools';
import {destinationWriteTest} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('notion', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      notion: {
        kind_property: 'Kind',
        projects: {
          kind: 'Project',
        },
        epics: {
          kind: 'Epic',
        },
        sprints: {
          kind: 'Sprint',
        },
        tasks: {
          kind: 'Task',
          include_additional_properties: true,
          properties: {
            type: 'Task Type',
            status: {
              name: 'Status',
              mapping: {
                todo: ['Not started'],
                in_progress: ['In progress'],
                done: ['Done'],
              },
            },
          },
        },
      },
    });
  });

  afterEach(() => mockttp.stop());

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/notion/catalog.json',
      inputRecordsPath: 'notion/all-streams.log',
    });
  });
});
