import {AirbyteLog, AirbyteLogLevel, AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Tasks} from '../../src/converters/asana/tasks';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {asanaAllStreamsLog} from './data';

describe('asana', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/asana/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__asana__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(asanaAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      projects: 1,
      sections: 3,
      stories: 3,
      tasks: 3,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Project: 1,
      tms_Task: 6,
      tms_TaskBoard: 3,
      tms_TaskBoardProjectRelationship: 3,
      tms_User: 1,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  describe('tasks', () => {
    const converter = new Tasks();

    test('completed task converts to status Done', async () => {
      const record = AirbyteRecord.make('tasks', {
        gid: '1205346703408262',
        assignee: {
          gid: '7440298482110',
        },
        completed: true,
        completed_at: '2023-08-25T20:59:25.481Z',
        completed_by: {
          gid: '7440298482110',
        },
        created_at: '2023-08-24T15:52:00.014Z',
        custom_fields: [],
        dependencies: [],
        dependents: [],
        due_at: null,
        due_on: '2023-08-31',
        followers: [
          {
            gid: '7440298482110',
          },
        ],
        hearted: false,
        hearts: [],
        html_notes: '<body></body>',
        is_rendered_as_separator: false,
        liked: false,
        likes: [],
        memberships: [
          {
            project: {
              gid: '1205346703408259',
            },
            section: {
              gid: '1205346703408260',
            },
          },
        ],
        modified_at: '2023-08-25T20:59:25.575Z',
        name: 'Task 1',
        notes: '',
        num_hearts: 0,
        num_likes: 0,
        num_subtasks: 0,
        parent: null,
        permalink_url:
          'https://app.asana.com/0/1205346703408259/1205346703408262',
        projects: [
          {
            gid: '1205346703408259',
          },
        ],
        resource_type: 'task',
        start_on: null,
        tags: [],
        resource_subtype: 'default_task',
        workspace: {
          gid: '1205346833089989',
        },
      });

      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });
});
