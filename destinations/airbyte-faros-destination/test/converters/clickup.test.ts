import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {
  initMockttp,
  sourceSpecificTempConfig,
  testLogger,
} from '../testing-tools';
import {clickupAllStreamsLog} from './data';

describe('clickup', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/clickup/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__clickup__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {
      clickup: {taskboard_sources: ['space', 'folder', 'list']},
    });
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
    cli.stdin.end(clickupAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      folders: 2,
      goals: 2,
      lists: 5,
      spaces: 7,
      tasks: 9,
      workspaces: 3,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Label: 2,
      tms_Project: 3,
      tms_Task: 9,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 14,
      tms_TaskBoardProjectRelationship: 14,
      tms_TaskBoardRelationship: 27,
      tms_TaskProjectRelationship: 9,
      tms_TaskTag: 2,
      tms_User: 3,
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
});
